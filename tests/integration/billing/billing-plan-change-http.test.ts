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
import { getStripeClient } from "../../../src/config/stripe.js";

import {
  getBillingPlan,
  type BillingPlanId,
} from "../../../src/modules/billing/billing.constants.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

describe("Plan-change HTTP flow", () => {
  const eventIds: string[] = [];

  let owner: Awaited<ReturnType<typeof createAuthenticatedAgent>>;

  let customerId: string;
  let subscriptionId: string;
  let periodStart: number;
  let periodEnd: number;
  let updateAttempts: number;
  let paymentPending: boolean;
  let targetPlan: BillingPlanId;
  let targetQuantity: number;

  let current: ReturnType<typeof subscription>;

  function price(planId: BillingPlanId | "additional") {
    const plan = planId === "additional"
      ? null
      : getBillingPlan(planId);

    const id = `price_plan_http_${planId}`;

    return {
      id,
      active: true,
      lookup_key: plan?.stripeLookupKey ??
        "pro-additional-user-monthly",
      livemode: false,
      type: "recurring",
      billing_scheme: "per_unit",
      currency: "usd",
      unit_amount: plan?.unitAmount ?? 1_000,
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

  function subscription(
    planId: BillingPlanId = "starter",
    quantity = 0,
    pending = false,
  ) {
    const items = [
      {
        id: "si_plan_http_base",
        quantity: 1,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        price: price(planId),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_plan_http_additional",
        quantity,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        price: price("additional"),
      });
    }

    return {
      id: subscriptionId,
      object: "subscription",
      customer: customerId,
      livemode: false,
      metadata: { organizationId: owner.organizationId },
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
      schedule: null,

      pending_update: pending
        ? { expires_at: periodEnd }
        : null,

      latest_invoice: "in_plan_http",

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function endpoint(operation: "preview" | "confirm") {
    return `/api/v1/organizations/${owner.organizationId}/billing/plan-change/${operation}`;
  }

  async function createPreview(
    planId: BillingPlanId = "pro",
    additionalUserQuantity = 2,
  ) {
    targetPlan = planId;
    targetQuantity = additionalUserQuantity;

    const response = await owner.agent
      .post(endpoint("preview"))
      .send({ planId, additionalUserQuantity });

    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response;
  }

  function confirm(changeId: string) {
    return owner.agent
      .post(endpoint("confirm"))
      .send({ changeId });
  }

  function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId: owner.organizationId },
    });
  }

  function overview() {
    return owner.agent.get(
      `/api/v1/organizations/${owner.organizationId}/billing`,
    );
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    owner = await createAuthenticatedAgent();

    const suffix = randomUUID();

    customerId = `cus_plan_http_${suffix}`;
    subscriptionId = `sub_plan_http_${suffix}`;
    periodStart = Math.floor(Date.now() / 1_000) - 3_600;
    periodEnd = periodStart + 30 * 86_400;
    updateAttempts = 0;
    paymentPending = false;
    targetPlan = "pro";
    targetQuantity = 2;

    await prisma.organizationBilling.update({
      where: { organizationId: owner.organizationId },
      data: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_plan_http_starter",
        planId: "starter",
        unitAmount: 8_900,
        status: "ACTIVE",
        trialStartedAt: null,
        trialEndsAt: null,
        lastSyncedAt: new Date(Date.now() - 60_000),
      },
    });

    current = subscription();

    const stripe = getStripeClient();

    mock.method(stripe.customers, "retrieve", async () => ({
      id: customerId,
      livemode: false,
      metadata: { organizationId: owner.organizationId },
    }));

    mock.method(
      stripe.subscriptions,
      "retrieve",
      async () => current,
    );

    mock.method(stripe.subscriptions, "list", async () => ({
      data: [current],
      has_more: false,
    }));

    mock.method(
      stripe.prices,
      "list",
      async (input: Stripe.PriceListParams) => ({
        data: [
          price("starter"),
          price("business"),
          price("pro"),
          price("additional"),
        ].filter(
          (item) => item.lookup_key === input.lookup_keys?.[0],
        ),
        has_more: false,
      }),
    );

    mock.method(stripe.invoices, "createPreview", async () => ({
      customer: customerId,
      livemode: false,
      currency: "usd",
      amount_due: 500,
    }));

    mock.method(stripe.subscriptions, "update", async () => {
      updateAttempts += 1;

      current = paymentPending
        ? {
            ...current,
            pending_update: { expires_at: periodEnd },
          }
        : subscription(targetPlan, targetQuantity);

      return current;
    });
  });

  afterEach(async () => {
    mock.restoreAll();

    await prisma.stripeWebhookEvent.deleteMany({
      where: { id: { in: eventIds } },
    });

    eventIds.length = 0;
  });

  it("returns a safe preview without changing the subscription", async () => {
    const response = await createPreview();
    const data = response.body.data;

    assert.equal(response.body.success, true);
    assert.equal(data.currentPlanId, "starter");
    assert.equal(data.targetPlanId, "pro");
    assert.equal(data.currentUserLimit, 2);
    assert.equal(data.targetUserLimit, 12);
    assert.equal(data.monthlyTotalAmount, 31_900);
    assert.equal(data.estimatedInvoiceAmountDue, 500);
    assert.equal(data.invoiceEstimateScope, "next_invoice");

    assert.match(String(response.headers["cache-control"]), /no-store/i);

    const serialized = JSON.stringify(data);

    assert.equal(serialized.includes(customerId), false);
    assert.equal(serialized.includes(subscriptionId), false);
    assert.equal(serialized.includes("price_plan_http"), false);

    assert.equal(updateAttempts, 0);
    assert.equal((await readBilling()).planId, "starter");
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("confirms the preview and exposes the new plan through Billing overview", async () => {
    const preview = await createPreview();
    const response = await confirm(preview.body.data.changeId);

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.status, "APPLIED");
    assert.equal(response.body.data.targetPlanId, "pro");
    assert.equal(response.body.data.targetUserLimit, 12);
    assert.equal(updateAttempts, 1);

    const billing = await overview();

    assert.equal(billing.status, 200, JSON.stringify(billing.body));
    assert.equal(billing.body.data.subscription.plan.id, "pro");
    assert.equal(billing.body.data.usage.userLimit, 12);
    assert.equal(billing.body.data.subscription.additionalUserQuantity, 2);
    assert.equal(billing.body.data.subscription.monthlyTotalAmount, 31_900);
  });

  it("completes a payment-pending confirmation through a signed webhook", async () => {
    paymentPending = true;

    const preview = await createPreview();
    const changeId = preview.body.data.changeId;
    const pending = await confirm(changeId);

    assert.equal(pending.status, 200, JSON.stringify(pending.body));
    assert.equal(pending.body.data.status, "PENDING_PAYMENT");
    assert.equal((await readBilling()).planId, "starter");

    current = subscription("pro", 2);

    const eventId = `evt_plan_http_${randomUUID()}`;
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
          id: "in_plan_http",
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

    assert.equal(webhook.status, 200, JSON.stringify(webhook.body));

    const billing = await readBilling();

    assert.equal(billing.planId, "pro");
    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activePlanChangeId, null);

    const change = await prisma.billingPlanChange.findUniqueOrThrow({
      where: { id: changeId },
    });

    assert.equal(change.status, "APPLIED");
    assert.equal(updateAttempts, 1);
  });

  it("rejects confirmation after the preview expires", async () => {
    const preview = await createPreview();
    const changeId = preview.body.data.changeId;

    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const response = await confirm(changeId);

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "BILLING_PLAN_PREVIEW_EXPIRED");
    assert.equal(updateAttempts, 0);
    assert.equal((await readBilling()).planId, "starter");
  });

  it("observes permission loss between preview and confirmation", async () => {
    const preview = await createPreview();

    await prisma.membership.update({
      where: { id: owner.membershipId },
      data: { role: "TECHNICIAN" },
    });

    const response = await confirm(preview.body.data.changeId);

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "INSUFFICIENT_PERMISSIONS");
    assert.equal(updateAttempts, 0);
  });

  it("does not submit again when a completed confirmation is repeated", async () => {
    const preview = await createPreview();
    const changeId = preview.body.data.changeId;

    const first = await confirm(changeId);
    const repeated = await confirm(changeId);

    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
    assert.deepEqual(repeated.body.data, first.body.data);
    assert.equal(updateAttempts, 1);
  });

  it("downgrades Pro to Business and removes additional-user billing", async () => {
    current = subscription("pro", 2);

    await prisma.organizationBilling.update({
      where: { organizationId: owner.organizationId },
      data: {
        planId: "pro",
        stripePriceId: "price_plan_http_pro",
        unitAmount: 29_900,
        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: "price_plan_http_additional",
        stripeAdditionalUserItemId: "si_plan_http_additional",
      },
    });

    const preview = await createPreview("business", 0);
    const response = await confirm(preview.body.data.changeId);

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.targetPlanId, "business");
    assert.equal(response.body.data.targetUserLimit, 5);
    assert.equal(response.body.data.monthlyTotalAmount, 18_900);

    const billing = await overview();

    assert.equal(billing.status, 200, JSON.stringify(billing.body));
    assert.equal(billing.body.data.subscription.plan.id, "business");
    assert.equal(billing.body.data.usage.userLimit, 5);
    assert.equal(billing.body.data.subscription.additionalUserQuantity, 0);
    assert.equal(billing.body.data.subscription.monthlyTotalAmount, 18_900);

    assert.equal((await readBilling()).stripeAdditionalUserItemId, null);
  });

  it("defaults omitted additional-user quantity to zero", async () => {
    targetPlan = "business";
    targetQuantity = 0;

    const preview = await owner.agent
      .post(endpoint("preview"))
      .send({ planId: "business" });

    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.data.targetAdditionalUserQuantity, 0);

    const confirmed = await confirm(preview.body.data.changeId);

    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.data.targetPlanId, "business");
    assert.equal(confirmed.body.data.monthlyTotalAmount, 18_900);
  });
});

//************************************************************** */