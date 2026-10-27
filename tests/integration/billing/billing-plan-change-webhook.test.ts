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
import { getStripeClient } from "../../../src/config/stripe.js";

import {
  getBillingPlan,
  type BillingPlanId,
} from "../../../src/modules/billing/billing.constants.js";

//************************************************************** */

describe("Signed plan-change billing webhooks", () => {
  const eventIds: string[] = [];
  const invoiceId = "in_plan_webhook";

  let organizationId: string;
  let ownerId: string;
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;
  let stripeReads: number;
  let periodStart: number;
  let periodEnd: number;

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

  function subscription(
    planId: BillingPlanId = "pro",
    quantity = 2,
    pending = false,
  ) {
    const plan = getBillingPlan(planId);

    const items = [
      {
        id: "si_plan_webhook_base",
        quantity: 1,
        current_period_start: periodStart,
        current_period_end: periodEnd,

        price: price(
          `price_plan_webhook_${planId}`,
          plan.stripeLookupKey,
          plan.unitAmount,
        ),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_plan_webhook_additional",
        quantity,
        current_period_start: periodStart,
        current_period_end: periodEnd,

        price: price(
          "price_plan_webhook_additional",
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
      created: periodStart,

      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_start: null,
      trial_end: null,

      latest_invoice: invoiceId,
      pending_update: pending
        ? { expires_at: periodEnd }
        : null,

      schedule: null,

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function event(
    type = "customer.subscription.pending_update_applied",
  ) {
    const id = `evt_plan_${randomUUID()}`;
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
          `motodesk:test:plan-change:${changeId}`,
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
    return prisma.billingPlanChange.findUniqueOrThrow({
      where: { id: changeId },
    });
  }

  function readEvent(id: string) {
    return prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id },
    });
  }

  function mapInvoice() {
    return prisma.billingPlanChange.update({
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

    periodStart = Math.floor(Date.now() / 1_000) - 3_600;
    periodEnd = periodStart + 30 * 86_400;

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Plan webhook ${suffix}`,
        slug: `plan-webhook-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await prisma.user.create({
      data: {
        email: `plan-webhook-${suffix}@example.com`,
        firstName: "Plan",
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

    customerId = `cus_plan_webhook_${suffix}`;
    subscriptionId = `sub_plan_webhook_${suffix}`;

    const baseline = new Date(Date.now() - 60_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_plan_webhook_starter",
        planId: "starter",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 8_900,
        lastSyncedAt: baseline,
      },
    });

    const prorationDate = Math.floor(Date.now() / 1_000);

    const change = await prisma.billingPlanChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId: ownerId,
        status: "PROCESSING",

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedStripePriceId: "price_plan_webhook_starter",

        expectedPlanId: "starter",
        targetPlanId: "pro",
        expectedAdditionalUserQuantity: 0,
        targetAdditionalUserQuantity: 2,

        expectedLastSyncedAt: baseline,
        prorationDate,
        currency: "usd",
        estimatedAmountDue: 1_000n,
        monthlyTotalAmount: 31_900n,

        stripeUpdateParameters: {
          items: [
            {
              id: "si_plan_webhook_base",
              price: "price_plan_webhook_pro",
              quantity: 1,
            },
            {
              price: "price_plan_webhook_additional",
              quantity: 2,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        },

        expiresAt: new Date(Date.now() + 600_000),
        submittedAt: new Date(Date.now() - 30_000),
      },
    });

    changeId = change.id;

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { activePlanChangeId: changeId },
    });

    current = subscription();

    const stripe = getStripeClient();

    mock.method(stripe.subscriptions, "list", async () => {
      stripeReads += 1;
      return {
        data: [current],
        has_more: false,
      };
    });

    mock.method(stripe.subscriptions, "retrieve", async () => {
      stripeReads += 1;
      return current;
    });

    mock.method(stripe.invoices, "retrieve", async () => ({
      id: invoiceId,
      customer: customerId,
      livemode: false,
      status: "void",
    }));
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

  it("atomically applies the plan and completes the signed event", async () => {
    const payload = event();
    const response = await deliver(payload);

    assert.equal(response.status, 200, JSON.stringify(response.body));

    const billing = await readBilling();
    const change = await readChange();
    const storedEvent = await readEvent(payload.id);

    assert.equal(billing.planId, "pro");
    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activePlanChangeId, null);
    assert.equal(change.status, "APPLIED");
    assert.ok(change.appliedAt);
    assert.ok(storedEvent.processedAt);
    assert.equal(storedEvent.processingToken, null);
  });

  it("acknowledges duplicate events without another Stripe read", async () => {
    const payload = event();

    assert.equal((await deliver(payload)).status, 200);
    const readsAfterFirst = stripeReads;

    assert.equal((await deliver(payload)).status, 200);
    assert.equal(stripeReads, readsAfterFirst);
    assert.equal((await readEvent(payload.id)).attemptCount, 1);
    assert.equal((await readChange()).status, "APPLIED");
  });

  it("recovers the pending invoice mapping and later applies payment completion", async () => {
    current = subscription("starter", 0, true);

    const pending = await deliver(event("customer.subscription.updated"));

    assert.equal(pending.status, 200, JSON.stringify(pending.body));
    assert.equal((await readChange()).status, "PENDING_PAYMENT");
    assert.equal((await readChange()).stripeInvoiceId, invoiceId);
    assert.equal((await readBilling()).planId, "starter");

    current = subscription("pro", 2);

    const paid = await deliver(event("invoice.paid"));

    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.equal((await readChange()).status, "APPLIED");
    assert.equal((await readBilling()).planId, "pro");
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("releases an expired pending change after verifying its invoice is void", async () => {
    await mapInvoice();
    current = subscription("starter", 0);

    const response = await deliver(
      event("customer.subscription.pending_update_expired"),
    );

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((await readChange()).status, "EXPIRED");
    assert.equal((await readBilling()).planId, "starter");
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("reconciles invoice-voided events", async () => {
    await mapInvoice();
    current = subscription("starter", 0);

    const response = await deliver(event("invoice.voided"));

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((await readChange()).status, "EXPIRED");
    assert.equal((await readBilling()).activePlanChangeId, null);
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

    assert.equal((await deliver(payload)).status, 503);
    assert.equal((await readEvent(payload.id)).processedAt, null);
    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal((await readBilling()).planId, "starter");

    failing = false;

    const retried = await deliver(payload);

    assert.equal(retried.status, 200, JSON.stringify(retried.body));
    assert.equal((await readChange()).status, "APPLIED");
    assert.equal((await readBilling()).planId, "pro");

    const storedEvent = await readEvent(payload.id);

    assert.ok(storedEvent.processedAt);
    assert.equal(storedEvent.attemptCount, 2);
  });

  it("reconciles an archived organization's subscription", async () => {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: "ARCHIVED" },
    });

    const response = await deliver(event());

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((await readChange()).status, "APPLIED");
    assert.equal((await readBilling()).planId, "pro");
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("rejects an invalid signature before recording or applying the event", async () => {
    const payload = event();

    const response = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=1,v1=invalid")
      .send(JSON.stringify(payload));

    assert.equal(response.status, 400);
    assert.equal(stripeReads, 0);

    assert.equal(
      await prisma.stripeWebhookEvent.count({
        where: { id: payload.id },
      }),
      0,
    );

    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal((await readBilling()).planId, "starter");
  });

  it("synchronizes a downgrade and removes Pro additional-user fields", async () => {
    const original = await readChange();

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        planId: "pro",
        stripePriceId: "price_plan_webhook_pro",
        unitAmount: 29_900,
        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: "price_plan_webhook_additional",
        stripeAdditionalUserItemId: "si_plan_webhook_additional",
      },
    });

    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: {
        expectedPlanId: "pro",
        targetPlanId: "business",
        expectedStripePriceId: "price_plan_webhook_pro",
        expectedAdditionalUserQuantity: 2,
        targetAdditionalUserQuantity: 0,
        monthlyTotalAmount: 18_900n,

        stripeUpdateParameters: {
          items: [
            {
              id: "si_plan_webhook_base",
              price: "price_plan_webhook_business",
              quantity: 1,
            },
            {
              id: "si_plan_webhook_additional",
              deleted: true,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: original.prorationDate,
        },
      },
    });

    current = subscription("business", 0);

    const response = await deliver(event());

    assert.equal(response.status, 200, JSON.stringify(response.body));

    const billing = await readBilling();

    assert.equal(billing.planId, "business");
    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.additionalUserUnitAmount, null);
    assert.equal(billing.stripeAdditionalUserPriceId, null);
    assert.equal(billing.stripeAdditionalUserItemId, null);
    assert.equal(billing.activePlanChangeId, null);
    assert.equal((await readChange()).status, "APPLIED");
  });
});

//************************************************************** */