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

import {
  assertOrganizationUserCapacity,
} from "../../../src/modules/billing/billing-capacity.service.js";

//************************************************************** */

describe("Signed user-capacity billing webhooks", () => {
  const eventIds: string[] = [];
  const invoiceId = "in_capacity_webhook";

  let organizationId: string;
  let ownerId: string;
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;
  let stripeReads: number;

  let current: ReturnType<typeof subscription>;

  function price(
    id: string,
    lookupKey: string,
    unitAmount: number,
  ) {
    return {
      id,
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
    };
  }

  function subscription(quantity = 2, pending = false) {
    const start = Math.floor(Date.now() / 1_000) - 3_600;
    const end = start + 30 * 86_400;

    const items = [
      {
        id: "si_capacity_webhook_base",
        quantity: 1,
        current_period_start: start,
        current_period_end: end,
        price: price(
          "price_capacity_webhook_base",
          "pro-monthly",
          29_900,
        ),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_capacity_webhook_additional",
        quantity,
        current_period_start: start,
        current_period_end: end,
        price: price(
          "price_capacity_webhook_additional",
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
      metadata: { organizationId },
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

      latest_invoice: invoiceId,
      pending_update: pending ? { expires_at: end } : null,

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function event(
    type = "customer.subscription.pending_update_applied",
  ) {
    const id = `evt_capacity_${randomUUID()}`;
    eventIds.push(id);

    return {
      id,
      object: "event",
      type,
      created: Math.floor(Date.now() / 1_000),
      livemode: false,

      request: {
        id: `req_${randomUUID()}`,
        idempotency_key:
          `motodesk:test:user-capacity:${changeId}`,
      },

      data: {
        object: type.startsWith("invoice.")
          ? {
              id: invoiceId,
              object: "invoice",
              customer: customerId,
              livemode: false,
            }
          : current,
      },
    };
  }

  async function deliver(payload: ReturnType<typeof event>) {
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    const body = JSON.stringify(payload);

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

  function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  function readChange() {
    return prisma.billingUserCapacityChange.findUniqueOrThrow({
      where: { id: changeId },
    });
  }

  function mapInvoice() {
    return prisma.billingUserCapacityChange.update({
      where: { id: changeId },
      data: {
        stripeInvoiceId: invoiceId,
        status: "PENDING_PAYMENT",
      },
    });
  }

  beforeEach(async () => {
    organizationId = "";
    ownerId = "";
    stripeReads = 0;

    assert.equal(env.STRIPE_MODE, "test");
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Capacity webhook ${suffix}`,
        slug: `capacity-webhook-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await prisma.user.create({
      data: {
        email: `capacity-webhook-${suffix}@example.com`,
        firstName: "Capacity",
        lastName: "Webhook",
        emailVerifiedAt: new Date(),
      },
    });

    ownerId = owner.id;

    await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    customerId = `cus_capacity_webhook_${suffix}`;
    subscriptionId = `sub_capacity_webhook_${suffix}`;

    const baseline = new Date(Date.now() - 60_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_capacity_webhook_base",
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,
        lastSyncedAt: baseline,
      },
    });

    const change = await prisma.billingUserCapacityChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId: ownerId,
        status: "PROCESSING",

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedAdditionalUserQuantity: 0,
        targetAdditionalUserQuantity: 2,
        expectedLastSyncedAt: baseline,

        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",
        estimatedAmountDue: 1_000n,
        monthlyTotalAmount: 31_900n,

        stripeUpdateParameters: {
          items: [{
            price: "price_capacity_webhook_additional",
            quantity: 2,
          }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
        },

        expiresAt: new Date(Date.now() + 600_000),
        submittedAt: new Date(Date.now() - 30_000),
      },
    });

    changeId = change.id;

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: changeId,
      },
    });

    current = subscription();

    const stripe = getStripeClient();

    mock.method(
      stripe.subscriptions,
      "list",
      async () => {
        stripeReads += 1;

        return {
          data: [current],
          has_more: false,
        };
      },
    );

    mock.method(
      stripe.subscriptions,
      "retrieve",
      async () => {
        stripeReads += 1;
        return current;
      },
    );

    mock.method(
      stripe.invoices,
      "retrieve",
      async () => ({
        id: invoiceId,
        customer: customerId,
        livemode: false,
        status: "void",
      }),
    );
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

    if (ownerId) {
      await prisma.user.deleteMany({
        where: { id: ownerId },
      });
    }

    eventIds.length = 0;
  });

  it("atomically applies capacity and completes the signed event", async () => {
    const payload = event();
    const response = await deliver(payload);

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    const billing = await readBilling();
    const change = await readChange();

    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activeUserCapacityChangeId, null);
    assert.equal(change.status, "APPLIED");
    assert.ok(change.appliedAt);

    const storedEvent =
      await prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: payload.id },
      });

    assert.ok(storedEvent.processedAt);
    assert.equal(storedEvent.processingToken, null);
  });

  it("acknowledges duplicates without another Stripe read", async () => {
    const payload = event();

    assert.equal((await deliver(payload)).status, 200);

    const readsAfterFirst = stripeReads;

    assert.equal((await deliver(payload)).status, 200);
    assert.equal(stripeReads, readsAfterFirst);

    const storedEvent =
      await prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: payload.id },
      });

    assert.equal(storedEvent.attemptCount, 1);
    assert.equal((await readChange()).status, "APPLIED");
  });

  it("recovers a pending invoice mapping and later applies a paid change", async () => {
    current = subscription(0, true);

    const pendingResponse = await deliver(
      event("customer.subscription.updated"),
    );

    assert.equal(
      pendingResponse.status,
      200,
      JSON.stringify(pendingResponse.body),
    );

    const pending = await readChange();

    assert.equal(pending.status, "PENDING_PAYMENT");
    assert.equal(pending.stripeInvoiceId, invoiceId);
    assert.equal((await readBilling()).additionalUserQuantity, 0);

    current = subscription(2, false);

    const paidResponse = await deliver(event("invoice.paid"));

    assert.equal(
      paidResponse.status,
      200,
      JSON.stringify(paidResponse.body),
    );

    assert.equal((await readChange()).status, "APPLIED");
    assert.equal((await readBilling()).additionalUserQuantity, 2);
    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      null,
    );
  });

  it("releases an expired pending update after verifying its invoice is void", async () => {
    await mapInvoice();
    current = subscription(0, false);

    const response = await deliver(
      event("customer.subscription.pending_update_expired"),
    );

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    assert.equal((await readChange()).status, "EXPIRED");
    assert.equal((await readBilling()).additionalUserQuantity, 0);
    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      null,
    );
  });

  it("reconciles invoice-voided events", async () => {
    await mapInvoice();
    current = subscription(0, false);

    const response = await deliver(event("invoice.voided"));

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    assert.equal((await readChange()).status, "EXPIRED");
    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      null,
    );
  });

  it("retries the same event after a reconciliation lookup failure", async () => {
    let failing = true;

    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => {
        if (failing) {
          throw new Error("Simulated reconciliation outage.");
        }

        return current;
      },
    );

    const payload = event();

    const failed = await deliver(payload);

    assert.equal(failed.status, 503);
    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal((await readBilling()).additionalUserQuantity, 0);

    const failedEvent =
      await prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: payload.id },
      });

    assert.equal(failedEvent.processedAt, null);

    failing = false;

    const retried = await deliver(payload);

    assert.equal(
      retried.status,
      200,
      JSON.stringify(retried.body),
    );

    assert.equal((await readChange()).status, "APPLIED");
    assert.equal((await readBilling()).additionalUserQuantity, 2);

    const completed =
      await prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: payload.id },
      });

    assert.ok(completed.processedAt);
    assert.equal(completed.attemptCount, 2);
  });

  it("reconciles archived organizations while rejecting new user capacity consumption", async () => {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: "ARCHIVED" },
    });

    const response = await deliver(event());

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    assert.equal((await readChange()).status, "APPLIED");
    assert.equal((await readBilling()).additionalUserQuantity, 2);

    await assert.rejects(
      prisma.$transaction(async (transaction) => {
        await assertOrganizationUserCapacity(
          transaction,
          organizationId,
        );
      }),
      { code: "ORGANIZATION_NOT_FOUND" },
    );
  });

  it("rejects an invalid signature before creating a webhook record", async () => {
    const payload = event();

    const response = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=1,v1=invalid")
      .send(JSON.stringify(payload));

    assert.equal(response.status, 400);

    assert.equal(
      await prisma.stripeWebhookEvent.count({
        where: { id: payload.id },
      }),
      0,
    );

    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal((await readBilling()).additionalUserQuantity, 0);
  });
});

//************************************************************** */