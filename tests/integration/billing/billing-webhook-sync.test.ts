import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

//************************************************************** */

describe("Billing webhook subscription synchronization", () => {
  const eventIds: string[] = [];

  let organizationId: string;
  let customerId: string;
  let subscriptionId: string;
  let stripeReads: number;

  function subscription(status = "trialing") {
    return {
      id: subscriptionId,
      object: "subscription",
      customer: customerId,
      livemode: false,
      metadata: { organizationId },
      collection_method: "charge_automatically",
      currency: "usd",
      status,
      created: 1_767_225_600,

      cancel_at_period_end: false,
      cancel_at: null,

      canceled_at:
        status === "canceled" ? 1_768_435_200 : null,

      ended_at:
        status === "canceled" ? 1_768_435_200 : null,

      trial_start: 1_767_225_600,
      trial_end: 1_768_435_200,

      items: {
        has_more: false,

        data: [
          {
            id: `si_${subscriptionId}`,
            quantity: 1,
            current_period_start: 1_767_225_600,
            current_period_end: 1_768_435_200,

            price: {
              id: `price_${subscriptionId}`,
              lookup_key: "starter-monthly",
              livemode: false,
              type: "recurring",
              billing_scheme: "per_unit",
              currency: "usd",
              unit_amount: 8_900,
              transform_quantity: null,
              custom_unit_amount: null,

              recurring: {
                interval: "month",
                interval_count: 1,
                usage_type: "licensed",
              },
            },
          },
        ],
      },
    };
  }

  function mockSubscriptionList(data: unknown[]): void {
    mock.method(
      getStripeClient().subscriptions,
      "list",
      async () => {
        stripeReads += 1;

        return {
          object: "list",
          data,
          has_more: false,
        };
      },
    );
  }

  function event(type = "customer.subscription.updated") {
    const id = `evt_test_${randomUUID()}`;
    eventIds.push(id);

    return {
      id,
      object: "event",
      created: Math.floor(Date.now() / 1_000),
      livemode: false,
      type,

      data: {
        // Deliberately differs from Stripe's retrieved state.
        object: {
          id: subscriptionId,
          object: "subscription",
          customer: customerId,
          status: "active",
        },
      },
    };
  }

  async function deliver(payload: ReturnType<typeof event>) {
    const body = JSON.stringify(payload);

    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    const signature =
      getStripeClient().webhooks.generateTestHeaderString({
        payload: body,
        secret: env.STRIPE_WEBHOOK_SECRET,
      });

    return request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(body);
  }

  async function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    stripeReads = 0;

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Webhook sync ${suffix}`,
        slug: `webhook-sync-${suffix}`,
      },
    });

    organizationId = organization.id;
    customerId = `cus_test_${suffix}`;
    subscriptionId = `sub_test_${suffix}`;

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
      },
    });

    mockSubscriptionList([subscription()]);
  });

  afterEach(async () => {
    mock.restoreAll();

    await prisma.stripeWebhookEvent.deleteMany({
      where: { id: { in: eventIds } },
    });

    if (organizationId) {
      await prisma.organization.deleteMany({
        where: { id: organizationId },
      });
    }

    eventIds.length = 0;
  });

  it("synchronizes current Stripe state instead of trusting the event snapshot", async () => {
    const payload = event();
    const response = await deliver(payload);

    assert.equal(response.status, 200);

    const billing = await readBilling();

    assert.equal(billing.status, "TRIALING");
    assert.equal(billing.planId, "starter");
    assert.equal(billing.stripeSubscriptionId, subscriptionId);
    assert.equal(billing.unitAmount, 8_900);
    assert.ok(billing.trialStartedAt);
    assert.ok(billing.lastSyncedAt);

    const storedEvent =
      await prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: payload.id },
      });

    assert.ok(storedEvent.processedAt);
    assert.equal(storedEvent.processingToken, null);
  });

  it("acknowledges completed duplicates without reading Stripe again", async () => {
    const payload = event();

    assert.equal((await deliver(payload)).status, 200);
    assert.equal((await deliver(payload)).status, 200);

    assert.equal(stripeReads, 1);

    const storedEvent =
      await prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: payload.id },
      });

    assert.equal(storedEvent.attemptCount, 1);
    assert.ok(storedEvent.processedAt);
  });

  it("keeps cancellation when an older subscription event arrives later", async () => {
    assert.equal((await deliver(event())).status, 200);

    mockSubscriptionList([subscription("canceled")]);

    const olderEvent = event("customer.subscription.created");
    olderEvent.created -= 60;

    assert.equal(
      (await deliver(olderEvent)).status,
      200,
    );

    const billing = await readBilling();

    assert.equal(billing.status, "CANCELED");
    assert.ok(billing.canceledAt);
    assert.ok(billing.endedAt);
  });

  it("rejects mismatched organization metadata without changing billing", async () => {
    mockSubscriptionList([
      {
        ...subscription(),

        metadata: {
          organizationId: "another-organization",
        },
      },
    ]);

    const payload = event();
    const response = await deliver(payload);

    assert.equal(response.status, 409);
    assert.equal(
      response.body.code,
      "BILLING_SUBSCRIPTION_CONFIGURATION_INVALID",
    );

    const billing = await readBilling();

    assert.equal(billing.status, "NOT_SUBSCRIBED");
    assert.equal(billing.stripeSubscriptionId, null);

    const storedEvent =
      await prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: payload.id },
      });

    assert.equal(storedEvent.processedAt, null);
    assert.equal(storedEvent.processingToken, null);
    assert.equal(
      storedEvent.lastErrorCode,
      "BILLING_WEBHOOK_PROCESSING_FAILED",
    );
  });

  it("retries the same event successfully after a Stripe lookup failure", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "list",
      async () => {
        throw new Error("Simulated Stripe outage.");
      },
    );

    const payload = event();
    const failed = await deliver(payload);

    assert.equal(failed.status, 503);
    assert.equal(
      failed.body.code,
      "BILLING_WEBHOOK_RETRY_REQUIRED",
    );

    assert.equal(
      (await readBilling()).status,
      "NOT_SUBSCRIBED",
    );

    mockSubscriptionList([subscription()]);

    const retried = await deliver(payload);

    assert.equal(retried.status, 200);
    assert.equal((await readBilling()).status, "TRIALING");

    const storedEvent =
      await prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: payload.id },
      });

    assert.equal(storedEvent.attemptCount, 2);
    assert.ok(storedEvent.processedAt);
    assert.equal(storedEvent.lastErrorCode, null);
  });
});