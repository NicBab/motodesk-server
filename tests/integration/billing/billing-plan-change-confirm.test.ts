import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import Stripe from "stripe";

import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";
import { getStripeClient } from "../../../src/config/stripe.js";

import {
  getBillingPlan,
  type BillingPlanId,
} from "../../../src/modules/billing/billing.constants.js";

import {
  confirmOrganizationBillingPlanChange,
} from "../../../src/modules/billing/billing-plan-change-confirm.service.js";

//************************************************************** */

type UpdateBehavior =
  | "apply"
  | "pending"
  | "network"
  | "applied_then_network"
  | "pending_then_network"
  | "reject"
  | "server";

describe("Billing plan-change confirmation service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  let organizationId: string;
  let ownerId: string;
  let ownerMembershipId: string;
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;

  let targetPlan: BillingPlanId;
  let targetQuantity: number;
  let trial: boolean;
  let periodStart: number;
  let periodEnd: number;

  let behavior: UpdateBehavior;
  let current: ReturnType<typeof makeSubscription>;

  let requests: {
    id: string;
    parameters: Stripe.SubscriptionUpdateParams;
    key: string | undefined;
  }[];

  function price(
    planId: BillingPlanId | "additional",
  ) {
    const plan = planId === "additional"
      ? null
      : getBillingPlan(planId);

    const id = `price_plan_confirm_${planId}`;

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

  function makeSubscription(
    planId: BillingPlanId = "starter",
    quantity = 0,
    pending = false,
  ) {
    const items = [
      {
        id: "si_plan_confirm_base",
        quantity: 1,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        price: price(planId),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_plan_confirm_additional",
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
      metadata: { organizationId },
      collection_method: "charge_automatically",
      currency: "usd",
      status: trial ? "trialing" : "active",
      created: periodStart,

      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_start: trial ? periodStart : null,
      trial_end: trial ? periodEnd : null,

      pending_update: pending
        ? { expires_at: periodEnd }
        : null,

      latest_invoice: pending
        ? "in_plan_confirm_pending"
        : "in_plan_confirm_paid",

      schedule: null,

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function confirm(
    actorId = ownerId,
    targetOrganizationId = organizationId,
  ) {
    return confirmOrganizationBillingPlanChange(
      targetOrganizationId,
      actorId,
      { changeId },
    );
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

  async function useDowngrade() {
    targetPlan = "business";
    targetQuantity = 0;
    current = makeSubscription("pro", 2);

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        planId: "pro",
        stripePriceId: "price_plan_confirm_pro",
        unitAmount: 29_900,
        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: "price_plan_confirm_additional",
        stripeAdditionalUserItemId: "si_plan_confirm_additional",
      },
    });

    const change = await readChange();

    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: {
        expectedPlanId: "pro",
        targetPlanId: "business",
        expectedStripePriceId: "price_plan_confirm_pro",
        expectedAdditionalUserQuantity: 2,
        targetAdditionalUserQuantity: 0,
        monthlyTotalAmount: 18_900n,

        stripeUpdateParameters: {
          items: [
            {
              id: "si_plan_confirm_base",
              price: "price_plan_confirm_business",
              quantity: 1,
            },
            {
              id: "si_plan_confirm_additional",
              deleted: true,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: change.prorationDate,
        },
      },
    });
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    requests = [];
    behavior = "apply";
    targetPlan = "pro";
    targetQuantity = 2;
    trial = false;

    periodStart = Math.floor(Date.now() / 1_000) - 3_600;
    periodEnd = periodStart + 30 * 86_400;

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Plan confirmation ${suffix}`,
        slug: `plan-confirmation-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    const owner = await prisma.user.create({
      data: {
        email: `plan-confirmation-${suffix}@example.com`,
        firstName: "Plan",
        lastName: "Confirmation",
        emailVerifiedAt: new Date(),
      },
    });

    ownerId = owner.id;
    userIds.push(ownerId);

    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    ownerMembershipId = membership.id;
    customerId = `cus_plan_confirm_${suffix}`;
    subscriptionId = `sub_plan_confirm_${suffix}`;

    const baseline = new Date(Date.now() - 60_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_plan_confirm_starter",
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

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedStripePriceId: "price_plan_confirm_starter",

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
              id: "si_plan_confirm_base",
              price: "price_plan_confirm_pro",
              quantity: 1,
            },
            {
              price: "price_plan_confirm_additional",
              quantity: 2,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        },

        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    changeId = change.id;
    current = makeSubscription();

    const stripe = getStripeClient();

    mock.method(stripe.customers, "retrieve", async () => ({
      id: customerId,
      livemode: false,
      metadata: { organizationId },
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

    mock.method(
      stripe.subscriptions,
      "update",
      async (
        id: string,
        parameters: Stripe.SubscriptionUpdateParams,
        options: Stripe.RequestOptions,
      ) => {
        requests.push({
          id,
          parameters,
          key: options.idempotencyKey,
        });

        if (behavior === "reject") {
          throw new Stripe.errors.StripeInvalidRequestError({
            type: "invalid_request_error",
            statusCode: 400,
            message: "Private provider configuration.",
          });
        }

        if (behavior === "server") {
          throw new Stripe.errors.StripeAPIError({
            type: "api_error",
            statusCode: 500,
            message: "Private provider failure.",
          });
        }

        if (behavior === "network") {
          throw new Error("Private interrupted response.");
        }

        if (
          behavior === "pending" ||
          behavior === "pending_then_network"
        ) {
          // Preserve the existing plan while payment is pending.
          current = {
            ...current,
            pending_update: { expires_at: periodEnd },
            latest_invoice: "in_plan_confirm_pending",
          };
        } else {
          current = makeSubscription(targetPlan, targetQuantity);
        }

        if (
          behavior === "applied_then_network" ||
          behavior === "pending_then_network"
        ) {
          throw new Error("Private interrupted response.");
        }

        return current;
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
  });

  it("submits the stored request and applies the verified target", async () => {
    const result = await confirm();

    assert.equal(result.status, "APPLIED");
    assert.equal(result.targetPlanId, "pro");
    assert.equal(result.targetUserLimit, 12);
    assert.equal(result.monthlyTotalAmount, 31_900);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.id, subscriptionId);

    assert.equal(
      requests[0]!.key,
      `motodesk:test:plan-change:${changeId}`,
    );

    assert.deepEqual(
      requests[0]!.parameters,
      (await readChange()).stripeUpdateParameters,
    );

    const billing = await readBilling();

    assert.equal(billing.planId, "pro");
    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activePlanChangeId, null);
  });

  it("returns an applied confirmation without another submission", async () => {
    const first = await confirm();
    const second = await confirm();

    assert.deepEqual(second, first);
    assert.equal(requests.length, 1);
  });

  it("records pending payment without applying the target plan", async () => {
    behavior = "pending";

    const result = await confirm();

    assert.equal(result.status, "PENDING_PAYMENT");
    assert.equal((await readChange()).stripeInvoiceId, "in_plan_confirm_pending");

    const billing = await readBilling();

    assert.equal(billing.planId, "starter");
    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activePlanChangeId, changeId);
  });

  it("does not resubmit a known pending-payment change", async () => {
    behavior = "pending";
    await confirm();

    const result = await confirm();

    assert.equal(result.status, "PENDING_PAYMENT");
    assert.equal(requests.length, 1);
  });

  it("retains the claim after an interrupted response", async () => {
    behavior = "network";

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_CHANGE_UNCONFIRMED",
    });

    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal((await readBilling()).activePlanChangeId, changeId);
    assert.equal((await readBilling()).planId, "starter");
  });

  it("recovers a change applied by Stripe before its response was interrupted", async () => {
    behavior = "applied_then_network";

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_CHANGE_UNCONFIRMED",
    });

    const result = await confirm();

    assert.equal(result.status, "APPLIED");
    assert.equal(requests.length, 1);
    assert.equal((await readBilling()).planId, "pro");
  });

  it("retries an unapplied uncertain request with identical parameters and key", async () => {
    behavior = "network";

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_CHANGE_UNCONFIRMED",
    });

    const firstSubmission = (await readChange()).submittedAt;

    behavior = "apply";
    const result = await confirm();

    assert.equal(result.status, "APPLIED");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], requests[0]);

    assert.equal(
      (await readChange()).submittedAt?.getTime(),
      firstSubmission?.getTime(),
    );
  });

  it("releases a definitively rejected request", async () => {
    behavior = "reject";

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_CHANGE_REJECTED",
    });

    assert.equal((await readChange()).status, "REJECTED");
    assert.equal((await readBilling()).activePlanChangeId, null);
    assert.equal((await readBilling()).planId, "starter");
  });

  it("retains the operation after a Stripe server error", async () => {
    behavior = "server";

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_CHANGE_UNCONFIRMED",
    });

    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal((await readBilling()).activePlanChangeId, changeId);
  });

  it("rechecks billing-update permission before confirmation", async () => {
    await prisma.membership.update({
      where: { id: ownerMembershipId },
      data: { role: "TECHNICIAN" },
    });

    await assert.rejects(confirm(), {
      code: "INSUFFICIENT_PERMISSIONS",
    });

    assert.equal(requests.length, 0);
    assert.equal((await readChange()).status, "QUOTED");
  });

  it("rejects confirmation through another organization", async () => {
    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Other plan confirmation ${suffix}`,
        slug: `other-plan-confirmation-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    await assert.rejects(confirm(ownerId, other.id), {
      code: "ORGANIZATION_NOT_FOUND",
    });

    assert.equal(requests.length, 0);
  });

  it("rejects an expired preview before submission", async () => {
    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_PREVIEW_EXPIRED",
    });

    assert.equal(requests.length, 0);
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("rejects a scheduled cancellation introduced after preview", async () => {
    current.cancel_at_period_end = true;

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_STATE_CHANGED",
    });

    assert.equal(requests.length, 0);
  });

  it("rejects altered stored payment behavior", async () => {
    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: {
        stripeUpdateParameters: {
          items: [{
            id: "si_plan_confirm_base",
            price: "price_plan_confirm_pro",
            quantity: 1,
          }],
          payment_behavior: "allow_incomplete",
          proration_behavior: "always_invoice",
        },
      },
    });

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_PREVIEW_REQUIRED",
    });

    assert.equal(requests.length, 0);
  });

  it("rechecks user usage before claiming a downgrade", async () => {
    await useDowngrade();

    // Owner plus five users exceeds Business's five seats.
    for (let index = 0; index < 5; index += 1) {
      const user = await prisma.user.create({
        data: {
          email: `plan-confirm-usage-${randomUUID()}@example.com`,
          firstName: "Usage",
          lastName: "Member",
        },
      });

      userIds.push(user.id);

      await prisma.membership.create({
        data: {
          organizationId,
          userId: user.id,
          role: "TECHNICIAN",
          status: "ACTIVE",
        },
      });
    }

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_CAPACITY_BELOW_USAGE",
    });

    assert.equal(requests.length, 0);
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("applies a downgrade and removes the Pro additional-user item", async () => {
    await useDowngrade();

    const result = await confirm();

    assert.equal(result.status, "APPLIED");
    assert.equal(result.targetPlanId, "business");
    assert.equal(result.targetUserLimit, 5);
    assert.equal(result.monthlyTotalAmount, 18_900);

    assert.deepEqual(requests[0]!.parameters.items, [
      {
        id: "si_plan_confirm_base",
        price: "price_plan_confirm_business",
        quantity: 1,
      },
      {
        id: "si_plan_confirm_additional",
        deleted: true,
      },
    ]);

    const billing = await readBilling();

    assert.equal(billing.planId, "business");
    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.stripeAdditionalUserItemId, null);
  });

  it("preserves the existing trial during a plan change", async () => {
    trial = true;
    current = makeSubscription();

    const trialStart = new Date(periodStart * 1_000);
    const trialEnd = new Date(periodEnd * 1_000);

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        status: "TRIALING",
        trialStartedAt: trialStart,
        trialEndsAt: trialEnd,
      },
    });

    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: {
        stripeUpdateParameters: {
          items: [
            {
              id: "si_plan_confirm_base",
              price: "price_plan_confirm_pro",
              quantity: 1,
            },
            {
              price: "price_plan_confirm_additional",
              quantity: 2,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "none",
        },
      },
    });

    const result = await confirm();

    assert.equal(result.status, "APPLIED");
    assert.equal(requests[0]!.parameters.proration_behavior, "none");
    assert.equal(requests[0]!.parameters.trial_end, undefined);

    const billing = await readBilling();

    assert.equal(billing.status, "TRIALING");
    assert.equal(billing.trialStartedAt?.getTime(), trialStart.getTime());
    assert.equal(billing.trialEndsAt?.getTime(), trialEnd.getTime());
  });

  it("does not overwrite an unidentified pending update after an interrupted response", async () => {
    behavior = "pending_then_network";

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_CHANGE_UNCONFIRMED",
    });

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });

    assert.equal(requests.length, 1);
    assert.equal((await readBilling()).activePlanChangeId, changeId);
    assert.equal((await readBilling()).planId, "starter");
  });

  it("rejects a configured target price that changed after preview", async () => {
    mock.method(
      getStripeClient().prices,
      "list",
      async () => ({
        data: [{
          ...price("pro"),
          id: "price_replaced_pro",
        }],
        has_more: false,
      }),
    );

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_STATE_CHANGED",
    });

    assert.equal(requests.length, 0);
    assert.equal((await readChange()).status, "QUOTED");
  });

  it("does not apply a provider response whose current state misses the target", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => current,
    );

    await assert.rejects(confirm(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });

    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal((await readBilling()).planId, "starter");
    assert.equal((await readBilling()).activePlanChangeId, changeId);
  });
});

//************************************************************** */