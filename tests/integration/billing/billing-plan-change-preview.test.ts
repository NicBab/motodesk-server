import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import type Stripe from "stripe";

import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";
import { getStripeClient } from "../../../src/config/stripe.js";

import {
  getBillingPlan,
  type BillingPlanId,
} from "../../../src/modules/billing/billing.constants.js";

import {
  previewOrganizationBillingPlanChange,
} from "../../../src/modules/billing/billing-plan-change-preview.service.js";

//************************************************************** */

describe("Billing plan-change preview service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  let organizationId: string;
  let ownerId: string;
  let ownerMembershipId: string;
  let customerId: string;
  let subscriptionId: string;

  let customerReads: number;
  let updateAttempts: number;
  let invoiceRequests: Stripe.InvoiceCreatePreviewParams[];

  function makePrice(
    lookupKey: string,
    unitAmount: number,
    id: string,
  ) {
    return {
      id,
      object: "price",
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

  function makeSubscription(
    planId: BillingPlanId = "starter",
    quantity = 0,
    trial = false,
  ) {
    const plan = getBillingPlan(planId);
    const start = Math.floor(Date.now() / 1_000) - 3_600;
    const end = start + 14 * 86_400;

    const items = [
      {
        id: "si_plan_preview_base",
        quantity: 1,
        current_period_start: start,
        current_period_end: end,

        price: makePrice(
          plan.stripeLookupKey,
          plan.unitAmount,
          `price_plan_preview_${planId}`,
        ),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_plan_preview_additional",
        quantity,
        current_period_start: start,
        current_period_end: end,

        price: makePrice(
          "pro-additional-user-monthly",
          1_000,
          "price_plan_preview_additional",
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
      status: trial ? "trialing" : "active",

      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,

      trial_start: trial ? start : null,
      trial_end: trial ? end : null,

      pending_update: null,
      schedule: null,

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  async function useSubscription(
    planId: BillingPlanId,
    quantity = 0,
    trial = false,
  ) {
    const subscription = makeSubscription(planId, quantity, trial);
    const plan = getBillingPlan(planId);

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        planId,
        status: trial ? "TRIALING" : "ACTIVE",
        stripePriceId: `price_plan_preview_${planId}`,
        unitAmount: plan.unitAmount,

        additionalUserQuantity: quantity,
        additionalUserUnitAmount: quantity > 0 ? 1_000 : null,

        stripeAdditionalUserPriceId:
          quantity > 0 ? "price_plan_preview_additional" : null,

        stripeAdditionalUserItemId:
          quantity > 0 ? "si_plan_preview_additional" : null,

        trialStartedAt: subscription.trial_start === null
          ? null
          : new Date(subscription.trial_start * 1_000),

        trialEndsAt: subscription.trial_end === null
          ? null
          : new Date(subscription.trial_end * 1_000),
      },
    });

    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => subscription,
    );

    return subscription;
  }

  function preview(
    planId: BillingPlanId = "business",
    additionalUserQuantity = 0,
    actorId = ownerId,
    targetOrganizationId = organizationId,
  ) {
    return previewOrganizationBillingPlanChange(
      targetOrganizationId,
      actorId,
      { planId, additionalUserQuantity },
    );
  }

  function quoteCount() {
    return prisma.billingPlanChange.count({
      where: {
        organizationBilling: { organizationId },
      },
    });
  }

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `plan-preview-${randomUUID()}@example.com`,
        firstName: "Plan",
        lastName: "Preview",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);
    return user;
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    customerReads = 0;
    updateAttempts = 0;
    invoiceRequests = [];

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Plan preview ${suffix}`,
        slug: `plan-preview-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    const owner = await createUser();
    ownerId = owner.id;

    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    ownerMembershipId = membership.id;
    customerId = `cus_plan_preview_${suffix}`;
    subscriptionId = `sub_plan_preview_${suffix}`;

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_plan_preview_starter",
        planId: "starter",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 8_900,
        lastSyncedAt: new Date(Date.now() - 60_000),
      },
    });

    const stripe = getStripeClient();

    mock.method(stripe.customers, "retrieve", async () => {
      customerReads += 1;

      return {
        id: customerId,
        object: "customer",
        livemode: false,
        metadata: { organizationId },
      };
    });

    mock.method(
      stripe.subscriptions,
      "retrieve",
      async () => makeSubscription(),
    );

    mock.method(stripe.subscriptions, "update", async () => {
      updateAttempts += 1;
      throw new Error("Preview must not update a subscription.");
    });

    mock.method(
      stripe.prices,
      "list",
      async (input: Stripe.PriceListParams) => {
        const lookupKey = input.lookup_keys?.[0];

        const prices = [
          makePrice(
            "starter-monthly",
            8_900,
            "price_plan_preview_starter",
          ),
          makePrice(
            "business-monthly",
            18_900,
            "price_plan_preview_business",
          ),
          makePrice(
            "pro-monthly",
            29_900,
            "price_plan_preview_pro",
          ),
          makePrice(
            "pro-additional-user-monthly",
            1_000,
            "price_plan_preview_additional",
          ),
        ];

        return {
          object: "list",
          has_more: false,
          data: prices.filter(
            (price) => price.lookup_key === lookupKey,
          ),
        };
      },
    );

    mock.method(
      stripe.invoices,
      "createPreview",
      async (input: Stripe.InvoiceCreatePreviewParams) => {
        invoiceRequests.push(input);

        return {
          id: "upcoming_plan_preview",
          object: "invoice",
          customer: customerId,
          livemode: false,
          currency: "usd",
          amount_due: 500,
        };
      },
    );
  });

  afterEach(async () => {
    mock.restoreAll();

    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });

    organizationIds.length = 0;
    userIds.length = 0;

    assert.equal(updateAttempts, 0);
  });

  it("previews Starter to Business and stores the fixed proration request", async () => {
    const result = await preview();

    assert.equal(result.currentPlanId, "starter");
    assert.equal(result.targetPlanId, "business");
    assert.equal(result.currentUserLimit, 2);
    assert.equal(result.targetUserLimit, 5);
    assert.equal(result.monthlyTotalAmount, 18_900);
    assert.equal(result.estimatedInvoiceAmountDue, 500);
    assert.equal(result.invoiceEstimateScope, "next_invoice");

    const change = await prisma.billingPlanChange.findUniqueOrThrow({
      where: { id: result.changeId },
    });

    assert.equal(change.status, "QUOTED");
    assert.equal(change.submittedAt, null);
    assert.equal(change.monthlyTotalAmount, 18_900n);

    assert.deepEqual(change.stripeUpdateParameters, {
      items: [{
        id: "si_plan_preview_base",
        price: "price_plan_preview_business",
        quantity: 1,
      }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: change.prorationDate,
    });

    assert.equal(
      invoiceRequests[0]!.subscription_details?.proration_date,
      change.prorationDate,
    );

    const billing = await prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });

    assert.equal(billing.planId, "starter");
    assert.equal(billing.activePlanChangeId, null);

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(customerId), false);
    assert.equal(serialized.includes(subscriptionId), false);
    assert.equal(serialized.includes("price_plan_preview"), false);
  });

  it("includes Pro additional users in the same proposed update", async () => {
    const result = await preview("pro", 2);

    assert.equal(result.targetUserLimit, 12);
    assert.equal(result.monthlyTotalAmount, 31_900);

    assert.deepEqual(
      invoiceRequests[0]!.subscription_details?.items,
      [
        {
          id: "si_plan_preview_base",
          price: "price_plan_preview_pro",
          quantity: 1,
        },
        {
          price: "price_plan_preview_additional",
          quantity: 2,
        },
      ],
    );
  });

  it("removes the Pro additional-user item when changing to Business", async () => {
    await useSubscription("pro", 2);

    const result = await preview("business");

    assert.equal(result.currentUserLimit, 12);
    assert.equal(result.targetUserLimit, 5);
    assert.equal(result.monthlyTotalAmount, 18_900);

    assert.deepEqual(
      invoiceRequests[0]!.subscription_details?.items,
      [
        {
          id: "si_plan_preview_base",
          price: "price_plan_preview_business",
          quantity: 1,
        },
        {
          id: "si_plan_preview_additional",
          deleted: true,
        },
      ],
    );
  });

  it("preserves the existing trial without requesting a new trial or prorations", async () => {
    const trial = await useSubscription("starter", 0, true);
    const result = await preview("pro", 2);

    assert.equal(
      result.trialEndsAt,
      new Date(trial.trial_end! * 1_000).toISOString(),
    );

    const change = await prisma.billingPlanChange.findUniqueOrThrow({
      where: { id: result.changeId },
    });

    assert.deepEqual(change.stripeUpdateParameters, {
      items: [
        {
          id: "si_plan_preview_base",
          price: "price_plan_preview_pro",
          quantity: 1,
        },
        {
          price: "price_plan_preview_additional",
          quantity: 2,
        },
      ],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "none",
    });

    assert.equal(
      invoiceRequests[0]!.subscription_details?.proration_date,
      undefined,
    );
  });

  it("rejects selecting the current plan", async () => {
    await assert.rejects(preview("starter"), {
      code: "BILLING_PLAN_UNCHANGED",
    });

    assert.equal(customerReads, 0);
    assert.equal(await quoteCount(), 0);
  });

  it("rejects a target plan below active user usage before Stripe calls", async () => {
    await useSubscription("pro");

    for (let index = 0; index < 2; index += 1) {
      const user = await createUser();

      await prisma.membership.create({
        data: {
          organizationId,
          userId: user.id,
          role: "TECHNICIAN",
          status: "ACTIVE",
        },
      });
    }

    await assert.rejects(preview("starter"), {
      code: "BILLING_PLAN_CAPACITY_BELOW_USAGE",
    });

    assert.equal(customerReads, 0);
  });

  it("includes pending invitations in the target capacity check", async () => {
    await useSubscription("pro");

    for (let index = 0; index < 2; index += 1) {
      await prisma.membershipInvitation.create({
        data: {
          organizationId,
          invitedByMembershipId: ownerMembershipId,
          email: `plan-seat-${randomUUID()}@example.com`,
          role: "TECHNICIAN",
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }

    await assert.rejects(preview("starter"), {
      code: "BILLING_PLAN_CAPACITY_BELOW_USAGE",
    });

    assert.equal(customerReads, 0);
  });

  it("requires billing-update permission", async () => {
    const user = await createUser();

    await prisma.membership.create({
      data: {
        organizationId,
        userId: user.id,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });

    await assert.rejects(
      preview("business", 0, user.id),
      { code: "INSUFFICIENT_PERMISSIONS" },
    );

    assert.equal(customerReads, 0);
  });

  it("rejects access through another organization", async () => {
    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Foreign plan preview ${suffix}`,
        slug: `foreign-plan-preview-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    await assert.rejects(
      preview("business", 0, ownerId, other.id),
      { code: "ORGANIZATION_NOT_FOUND" },
    );

    assert.equal(customerReads, 0);
  });

  it("does not sell plan changes to exempt organizations", async () => {
    await prisma.platformAdmin.create({
      data: {
        userId: ownerId,
        role: "SUPER_ADMIN",
        billingExempt: true,
      },
    });

    await assert.rejects(preview(), {
      code: "BILLING_EXEMPT",
    });

    assert.equal(customerReads, 0);
  });

  it("rejects a Stripe customer with mismatched tenant metadata", async () => {
    mock.method(
      getStripeClient().customers,
      "retrieve",
      async () => ({
        id: customerId,
        livemode: false,
        metadata: { organizationId: "another-organization" },
      }),
    );

    await assert.rejects(preview(), {
      code: "BILLING_CUSTOMER_MAPPING_INVALID",
    });

    assert.equal(await quoteCount(), 0);
  });

  it("requires synchronization when Stripe and local plans disagree", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => makeSubscription("business"),
    );

    await assert.rejects(preview("pro"), {
      code: "BILLING_PLAN_STATE_CHANGED",
    });

    assert.equal(invoiceRequests.length, 0);
    assert.equal(await quoteCount(), 0);
  });

  it("blocks an existing Stripe pending update", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => ({
        ...makeSubscription(),
        pending_update: {
          expires_at: Math.floor(Date.now() / 1_000) + 3_600,
        },
      }),
    );

    await assert.rejects(preview(), {
      code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    });

    assert.equal(invoiceRequests.length, 0);
  });

  it("blocks an existing Stripe subscription schedule", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => ({
        ...makeSubscription(),
        schedule: "sub_sched_existing",
      }),
    );

    await assert.rejects(preview(), {
      code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    });

    assert.equal(await quoteCount(), 0);
  });

  it("requires scheduled cancellation to be undone first", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => ({
        ...makeSubscription(),
        cancel_at_period_end: true,
      }),
    );

    await assert.rejects(preview(), {
      code: "BILLING_CANCELLATION_SCHEDULED",
    });

    assert.equal(await quoteCount(), 0);
  });

  it("rejects invalid invoice identity, currency, mode, or amount", async () => {
    const invalidFields = [
      { customer: "cus_other" },
      { currency: "eur" },
      { livemode: true },
      { amount_due: -1 },
      { amount_due: 1.5 },
      { amount_due: Number.MAX_SAFE_INTEGER + 1 },
    ];

    for (const overrides of invalidFields) {
      mock.method(
        getStripeClient().invoices,
        "createPreview",
        async () => ({
          customer: customerId,
          livemode: false,
          currency: "usd",
          amount_due: 500,
          ...overrides,
        }),
      );

      await assert.rejects(preview(), {
        code: "BILLING_PLAN_PREVIEW_INVALID",
      });
    }

    assert.equal(await quoteCount(), 0);
  });

  it("sanitizes provider failures without storing a preview", async () => {
    mock.method(
      getStripeClient().invoices,
      "createPreview",
      async () => {
        throw new Error("Private provider request details.");
      },
    );

    await assert.rejects(preview(), (error: unknown) => {
      assert.ok(error instanceof Error);

      assert.equal(
        "code" in error ? error.code : undefined,
        "BILLING_PLAN_PREVIEW_UNAVAILABLE",
      );

      assert.equal(error.message.includes("Private provider"), false);
      return true;
    });

    assert.equal(await quoteCount(), 0);
  });

  it("blocks previews while a local billing operation is active", async () => {
    for (const field of [
      "activePlanChangeId",
      "activeUserCapacityChangeId",
    ] as const) {
      await prisma.organizationBilling.update({
        where: { organizationId },
        data: { [field]: randomUUID() },
      });

      await assert.rejects(preview(), {
        code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
      });

      await prisma.organizationBilling.update({
        where: { organizationId },
        data: { [field]: null },
      });
    }

    assert.equal(customerReads, 0);
    assert.equal(await quoteCount(), 0);
  });

  it("rejects invalid quantities and non-Pro additional users", async () => {
    for (const quantity of [-1, 1.5, 2_147_483_648]) {
      await assert.rejects(preview("pro", quantity), {
        code: "BILLING_PLAN_CHANGE_INPUT_INVALID",
      });
    }

    await assert.rejects(preview("business", 1), {
      code: "BILLING_PLAN_CHANGE_INPUT_INVALID",
    });

    assert.equal(customerReads, 0);
  });

  it("rejects an invalid target Stripe price without storing a preview", async () => {
    mock.method(
      getStripeClient().prices,
      "list",
      async () => ({
        object: "list",
        has_more: false,
        data: [
          makePrice(
            "business-monthly",
            1,
            "price_invalid_business",
          ),
        ],
      }),
    );

    await assert.rejects(preview(), {
      code: "BILLING_PRICE_CONFIGURATION_INVALID",
    });

    assert.equal(invoiceRequests.length, 0);
    assert.equal(await quoteCount(), 0);
  });
});

//************************************************************** */