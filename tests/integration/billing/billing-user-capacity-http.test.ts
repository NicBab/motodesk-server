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

import type Stripe from "stripe";

import { app } from "../../../src/app.js";
import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

describe("User-capacity purchase HTTP flow", () => {
  const eventIds: string[] = [];

  let owner: Awaited<
    ReturnType<typeof createAuthenticatedAgent>
  >;

  let customerId: string;
  let subscriptionId: string;
  let additionalPriceId: string;
  let updateAttempts: number;

  let current: ReturnType<typeof subscription>;

  function price(
    id: string,
    lookupKey: string,
    unitAmount: number,
  ) {
    return {
      id,
      active: true,
      lookup_key: lookupKey,
      livemode: false,
      type: "recurring",
      billing_scheme: "per_unit",
      currency: "usd",
      unit_amount: unitAmount,
      transform_quantity: null,
      custom_unit_amount: null,

      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "licensed",
      },

      product: {
        id: `prod_${id}`,
        active: true,
        livemode: false,
      },
    };
  }

  function subscription(quantity = 0, pending = false) {
    const start = Math.floor(Date.now() / 1_000) - 3_600;
    const end = start + 30 * 86_400;

    const items = [
      {
        id: "si_http_base",
        quantity: 1,
        current_period_start: start,
        current_period_end: end,
        price: price(
          "price_http_pro",
          "pro-monthly",
          29_900,
        ),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_http_additional",
        quantity,
        current_period_start: start,
        current_period_end: end,
        price: price(
          additionalPriceId,
          "pro-additional-user-monthly",
          1_000,
        ),
      });
    }

    return {
      id: subscriptionId,
      object: "subscription",
      customer: customerId,
      livemode: false,
      metadata: {
        organizationId: owner.organizationId,
      },
      collection_method: "charge_automatically",
      currency: "usd",
      status: "active",
      created: start,

      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_start: null,
      trial_end: null,
      schedule: null,

      pending_update: pending ? { expires_at: end } : null,
      latest_invoice: "in_capacity_http",

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function endpoint(operation: "preview" | "confirm") {
    return `/api/v1/organizations/${owner.organizationId}/billing/user-capacity/${operation}`;
  }

  async function createPreview() {
    const response = await owner.agent
      .post(endpoint("preview"))
      .send({
        additionalUserQuantity: 2,
      });

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    return response;
  }

  function confirm(changeId: string) {
    return owner.agent
      .post(endpoint("confirm"))
      .send({ changeId });
  }

  function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: {
        organizationId: owner.organizationId,
      },
    });
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    owner = await createAuthenticatedAgent();

    const suffix = randomUUID();

    customerId = `cus_http_${suffix}`;
    subscriptionId = `sub_http_${suffix}`;
    additionalPriceId = `price_http_additional_${suffix}`;
    updateAttempts = 0;

    await prisma.organizationBilling.update({
      where: {
        organizationId: owner.organizationId,
      },

      data: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_http_pro",
        status: "ACTIVE",
        trialStartedAt: null,
        trialEndsAt: null,
        lastSyncedAt: new Date(Date.now() - 60_000),
      },
    });

    current = subscription();

    const stripe = getStripeClient();

    mock.method(
      stripe.customers,
      "retrieve",
      async () => ({
        id: customerId,
        livemode: false,
        metadata: {
          organizationId: owner.organizationId,
        },
      }),
    );

    mock.method(
      stripe.subscriptions,
      "retrieve",
      async () => current,
    );

    mock.method(
      stripe.subscriptions,
      "list",
      async () => ({
        data: [current],
        has_more: false,
      }),
    );

    mock.method(
      stripe.prices,
      "list",
      async () => ({
        data: [
          price(
            additionalPriceId,
            "pro-additional-user-monthly",
            1_000,
          ),
        ],
        has_more: false,
      }),
    );

    mock.method(
      stripe.invoices,
      "createPreview",
      async () => ({
        customer: customerId,
        livemode: false,
        currency: "usd",
        amount_due: 500,
      }),
    );

    mock.method(
      stripe.subscriptions,
      "update",
      async (
        _id: string,
        _parameters: Stripe.SubscriptionUpdateParams,
      ) => {
        updateAttempts += 1;
        current = subscription(2);
        return current;
      },
    );
  });

  afterEach(async () => {
    mock.restoreAll();

    await prisma.stripeWebhookEvent.deleteMany({
      where: {
        id: { in: eventIds },
      },
    });

    eventIds.length = 0;
  });

  it("returns a safe preview without purchasing capacity", async () => {
    const response = await createPreview();
    const data = response.body.data;

    assert.equal(response.body.success, true);
    assert.equal(data.currentUserLimit, 10);
    assert.equal(data.targetUserLimit, 12);
    assert.equal(data.monthlyTotalAmount, 31_900);
    assert.equal(data.estimatedInvoiceAmountDue, 500);
    assert.equal(data.invoiceEstimateScope, "next_invoice");

    assert.match(
      String(response.headers["cache-control"]),
      /no-store/i,
    );

    const serialized = JSON.stringify(data);

    assert.equal(serialized.includes(customerId), false);
    assert.equal(serialized.includes(subscriptionId), false);
    assert.equal(serialized.includes(additionalPriceId), false);

    assert.equal(updateAttempts, 0);
    assert.equal((await readBilling()).additionalUserQuantity, 0);
    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      null,
    );
  });

  it("confirms the preview and exposes purchased capacity through billing", async () => {
    const preview = await createPreview();

    const response = await confirm(
      preview.body.data.changeId,
    );

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, "APPLIED");
    assert.equal(response.body.data.targetUserLimit, 12);
    assert.equal(response.body.data.monthlyTotalAmount, 31_900);
    assert.equal(updateAttempts, 1);

    const overview = await owner.agent.get(
      `/api/v1/organizations/${owner.organizationId}/billing`,
    );

    assert.equal(overview.status, 200);
    assert.equal(overview.body.data.usage.userLimit, 12);
    assert.equal(
      overview.body.data.subscription.additionalUserQuantity,
      2,
    );
    assert.equal(
      overview.body.data.subscription.monthlyTotalAmount,
      31_900,
    );
  });

  it("completes a payment-pending confirmation through a signed webhook", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => {
        updateAttempts += 1;
        current = subscription(0, true);
        return current;
      },
    );

    const preview = await createPreview();
    const changeId = preview.body.data.changeId;

    const pending = await confirm(changeId);

    assert.equal(
      pending.status,
      200,
      JSON.stringify(pending.body),
    );
    assert.equal(pending.body.data.status, "PENDING_PAYMENT");
    assert.equal((await readBilling()).additionalUserQuantity, 0);

    current = subscription(2, false);

    const eventId = `evt_http_capacity_${randomUUID()}`;
    eventIds.push(eventId);

    const body = JSON.stringify({
      id: eventId,
      object: "event",
      type: "invoice.paid",
      created: Math.floor(Date.now() / 1_000),
      livemode: false,
      request: null,

      data: {
        object: {
          id: "in_capacity_http",
          object: "invoice",
          customer: customerId,
          livemode: false,
        },
      },
    });

    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    const signature =
      getStripeClient().webhooks.generateTestHeaderString({
        payload: body,
        secret: env.STRIPE_WEBHOOK_SECRET,
      });

    const webhook = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(body);

    assert.equal(
      webhook.status,
      200,
      JSON.stringify(webhook.body),
    );

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activeUserCapacityChangeId, null);

    const change =
      await prisma.billingUserCapacityChange.findUniqueOrThrow({
        where: { id: changeId },
      });

    assert.equal(change.status, "APPLIED");
    assert.equal(updateAttempts, 1);
  });

  it("rejects confirmation after the preview expires", async () => {
    const preview = await createPreview();
    const changeId = preview.body.data.changeId;

    await prisma.billingUserCapacityChange.update({
      where: { id: changeId },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await confirm(changeId);

    assert.equal(response.status, 409);
    assert.equal(
      response.body.code,
      "BILLING_CAPACITY_PREVIEW_EXPIRED",
    );
    assert.equal(updateAttempts, 0);
    assert.equal((await readBilling()).additionalUserQuantity, 0);
  });

  it("observes permission loss between preview and confirmation", async () => {
    const preview = await createPreview();

    await prisma.membership.update({
      where: {
        id: owner.membershipId,
      },

      data: {
        role: "TECHNICIAN",
      },
    });

    const response = await confirm(
      preview.body.data.changeId,
    );

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "INSUFFICIENT_PERMISSIONS",
    );
    assert.equal(updateAttempts, 0);
    assert.equal((await readBilling()).additionalUserQuantity, 0);
  });

  it("does not charge again when a completed confirmation is repeated", async () => {
    const preview = await createPreview();
    const changeId = preview.body.data.changeId;

    const first = await confirm(changeId);
    const repeated = await confirm(changeId);

    assert.equal(first.status, 200);
    assert.equal(repeated.status, 200);
    assert.deepEqual(repeated.body.data, first.body.data);
    assert.equal(updateAttempts, 1);
  });
});

//************************************************************** */