import assert from "node:assert/strict";

import { beforeEach, describe, it } from "node:test";

import type Stripe from "stripe";

import { env } from "../../../src/config/env.js";

import type {
  BillingPlanChange,
  Prisma,
} from "../../../src/generated/prisma/client.js";

import {
  getBillingPlan,
  type BillingPlanId,
} from "../../../src/modules/billing/billing.constants.js";

import {
  assertBillingPlanChangeUpdateMatchesSubscription,
  readBillingPlanChangeUpdateParameters,
} from "../../../src/modules/billing/billing-plan-change-parameters.js";

//************************************************************** */

const ORGANIZATION_ID = "org_plan_parameters";
const CUSTOMER_ID = "cus_plan_parameters";
const SUBSCRIPTION_ID = "sub_plan_parameters";

const PERIOD_START = 1_791_158_400;
const PERIOD_END = PERIOD_START + 30 * 86_400;
const PRORATION_DATE = PERIOD_START + 10 * 86_400;

function makeChange(
  source: BillingPlanId = "starter",
  target: BillingPlanId = "business",
  expectedQuantity = 0,
  targetQuantity = 0,
  trial = false,
): BillingPlanChange {
  const targetPlan = getBillingPlan(target);

  const items: Prisma.JsonObject[] = [
    {
      id: "si_plan_parameters_base",
      price: `price_plan_parameters_${target}`,
      quantity: 1,
    },
  ];

  if (expectedQuantity > 0) {
    items.push({
      id: "si_plan_parameters_additional",
      deleted: true,
    });
  } else if (targetQuantity > 0) {
    items.push({
      price: "price_plan_parameters_additional",
      quantity: targetQuantity,
    });
  }

  const now = new Date();

  return {
    id: "00000000-0000-4000-8000-000000000001",
    organizationBillingId: "billing_plan_parameters",
    requestedByUserId: "user_plan_parameters",
    status: "QUOTED",

    stripeCustomerId: CUSTOMER_ID,
    stripeSubscriptionId: SUBSCRIPTION_ID,
    expectedStripePriceId: `price_plan_parameters_${source}`,

    expectedPlanId: source,
    targetPlanId: target,

    expectedAdditionalUserQuantity: expectedQuantity,
    targetAdditionalUserQuantity: targetQuantity,

    expectedLastSyncedAt: null,
    prorationDate: PRORATION_DATE,
    currency: "usd",

    estimatedAmountDue: 500n,
    monthlyTotalAmount:
      BigInt(targetPlan.unitAmount) +
      BigInt(targetQuantity) *
        BigInt(targetPlan.additionalUserPricing?.unitAmount ?? 0),

    stripeUpdateParameters: {
      items,
      payment_behavior: "pending_if_incomplete",
      proration_behavior: trial ? "none" : "always_invoice",

      ...(!trial ? { proration_date: PRORATION_DATE } : {}),
    },

    expiresAt: new Date(now.getTime() + 600_000),
    submittedAt: null,
    stripeInvoiceId: null,
    appliedAt: null,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makePrice(id: string, lookupKey: string, unitAmount: number) {
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

function makeSubscription(
  planId: BillingPlanId = "starter",
  quantity = 0,
  trial = false,
) {
  const plan = getBillingPlan(planId);

  const items = [
    {
      id: "si_plan_parameters_base",
      quantity: 1,
      current_period_start: PERIOD_START,
      current_period_end: PERIOD_END,

      price: makePrice(
        `price_plan_parameters_${planId}`,
        plan.stripeLookupKey,
        plan.unitAmount,
      ),
    },
  ];

  if (quantity > 0) {
    items.push({
      id: "si_plan_parameters_additional",
      quantity,
      current_period_start: PERIOD_START,
      current_period_end: PERIOD_END,

      price: makePrice(
        "price_plan_parameters_additional",
        "pro-additional-user-monthly",
        1_000,
      ),
    });
  }

  return {
    id: SUBSCRIPTION_ID,
    customer: CUSTOMER_ID,
    livemode: false,
    metadata: { organizationId: ORGANIZATION_ID },
    collection_method: "charge_automatically",
    currency: "usd",
    status: trial ? "trialing" : "active",

    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,

    trial_start: trial ? PERIOD_START : null,
    trial_end: trial ? PERIOD_END : null,

    pending_update: null,
    schedule: null,

    items: {
      has_more: false,
      data: items,
    },
  };
}

// Fixtures deliberately contain only the fields read by validation.
function validateSubscription(
  change: BillingPlanChange,
  subscription: unknown,
) {
  assertBillingPlanChangeUpdateMatchesSubscription(
    ORGANIZATION_ID,
    change,
    subscription as Stripe.Subscription,
  );
}

function replaceParameters(
  change: BillingPlanChange,
  overrides: Record<string, unknown>,
) {
  const current = readBillingPlanChangeUpdateParameters(change);

  change.stripeUpdateParameters = JSON.parse(
    JSON.stringify({
      ...current,
      ...overrides,
    }),
  );
}

function assertInvalid(change: BillingPlanChange) {
  assert.throws(() => readBillingPlanChangeUpdateParameters(change), {
    code: "BILLING_PLAN_PREVIEW_REQUIRED",
  });
}

//************************************************************** */

describe("Billing plan-change confirmation parameters", () => {
  beforeEach(() => {
    assert.equal(env.STRIPE_MODE, "test");
  });

  it("reads a base-plan upgrade with a fixed proration date", () => {
    assert.deepEqual(readBillingPlanChangeUpdateParameters(makeChange()), {
      items: [
        {
          id: "si_plan_parameters_base",
          price: "price_plan_parameters_business",
          quantity: 1,
        },
      ],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
    });
  });

  it("reads an upgrade to Pro with additional users", () => {
    const change = makeChange("starter", "pro", 0, 2);
    const parameters = readBillingPlanChangeUpdateParameters(change);

    assert.deepEqual(parameters.items, [
      {
        id: "si_plan_parameters_base",
        price: "price_plan_parameters_pro",
        quantity: 1,
      },
      {
        price: "price_plan_parameters_additional",
        quantity: 2,
      },
    ]);
  });

  it("reads a downgrade that removes Pro's additional-user item", () => {
    const change = makeChange("pro", "business", 2);
    const parameters = readBillingPlanChangeUpdateParameters(change);

    assert.deepEqual(parameters.items, [
      {
        id: "si_plan_parameters_base",
        price: "price_plan_parameters_business",
        quantity: 1,
      },
      {
        id: "si_plan_parameters_additional",
        deleted: true,
      },
    ]);
  });

  it("reads trial parameters without a proration date", () => {
    const change = makeChange("starter", "business", 0, 0, true);
    const parameters = readBillingPlanChangeUpdateParameters(change);

    assert.equal(parameters.proration_behavior, "none");
    assert.equal("proration_date" in parameters, false);
  });

  it("rejects unexpected billing options", () => {
    for (const overrides of [
      { trial_end: "now" },
      { billing_cycle_anchor: "now" },
      { metadata: { organizationId: "another-organization" } },
      { payment_behavior: "allow_incomplete" },
      { proration_behavior: "create_prorations" },
    ]) {
      const change = makeChange();
      replaceParameters(change, overrides);
      assertInvalid(change);
    }
  });

  it("rejects malformed base-item updates", () => {
    for (const item of [
      { price: "price_business", quantity: 1 },
      { id: "si_base", price: "price_business", quantity: 2 },
      { id: "si_base", deleted: true },
      { id: "si_base", price: "price_business", quantity: 1, extra: true },
    ]) {
      const change = makeChange();
      replaceParameters(change, { items: [item] });
      assertInvalid(change);
    }
  });

  it("rejects an unexpected additional item", () => {
    const change = makeChange();

    replaceParameters(change, {
      items: [
        {
          id: "si_plan_parameters_base",
          price: "price_plan_parameters_business",
          quantity: 1,
        },
        {
          price: "price_unexpected",
          quantity: 1,
        },
      ],
    });

    assertInvalid(change);
  });

  it("requires removal of the existing Pro additional-user item", () => {
    const change = makeChange("pro", "business", 2);

    replaceParameters(change, {
      items: [
        {
          id: "si_plan_parameters_base",
          price: "price_plan_parameters_business",
          quantity: 1,
        },
      ],
    });

    assertInvalid(change);
  });

  it("rejects an additional-user quantity different from the preview", () => {
    const change = makeChange("starter", "pro", 0, 2);

    replaceParameters(change, {
      items: [
        {
          id: "si_plan_parameters_base",
          price: "price_plan_parameters_pro",
          quantity: 1,
        },
        {
          price: "price_plan_parameters_additional",
          quantity: 3,
        },
      ],
    });

    assertInvalid(change);
  });

  it("rejects unsupported or inconsistent plan terms", () => {
    const invalidTerms: Partial<BillingPlanChange>[] = [
      { targetPlanId: "enterprise" },
      { expectedPlanId: "enterprise" },
      { targetPlanId: "starter" },
      { expectedAdditionalUserQuantity: 1 },
      { targetAdditionalUserQuantity: 1 },
      { targetAdditionalUserQuantity: -1 },
      { targetAdditionalUserQuantity: 2_147_483_648 },
    ];

    for (const overrides of invalidTerms) {
      assertInvalid({
        ...makeChange(),
        ...overrides,
      });
    }
  });

  it("rejects inconsistent amounts or currency", () => {
    for (const overrides of [
      { monthlyTotalAmount: 1n },
      { estimatedAmountDue: -1n },
      { estimatedAmountDue: BigInt(Number.MAX_SAFE_INTEGER) + 1n },
      { currency: "eur" },
    ]) {
      assertInvalid({
        ...makeChange(),
        ...overrides,
      });
    }
  });

  it("rejects changed or inappropriate proration timestamps", () => {
    const changedDate = makeChange();

    replaceParameters(changedDate, {
      proration_date: PRORATION_DATE + 1,
    });

    assertInvalid(changedDate);

    const trial = makeChange("starter", "business", 0, 0, true);

    replaceParameters(trial, {
      proration_date: PRORATION_DATE,
    });

    assertInvalid(trial);
  });

  it("accepts a paid request matching the current subscription", () => {
    assert.doesNotThrow(() => {
      validateSubscription(makeChange(), makeSubscription());
    });
  });

  it("accepts a trial request matching the current subscription", () => {
    assert.doesNotThrow(() => {
      validateSubscription(
        makeChange("starter", "pro", 0, 2, true),
        makeSubscription("starter", 0, true),
      );
    });
  });

  it("rejects a different subscription identifier", () => {
    assert.throws(
      () =>
        validateSubscription(makeChange(), {
          ...makeSubscription(),
          id: "sub_other",
        }),
      { code: "BILLING_PLAN_STATE_CHANGED" },
    );
  });

  it("rejects a stale base subscription-item identifier", () => {
    const subscription = makeSubscription();
    subscription.items.data[0]!.id = "si_replaced_base";

    assert.throws(() => validateSubscription(makeChange(), subscription), {
      code: "BILLING_PLAN_STATE_CHANGED",
    });
  });

  it("rejects a stale additional-user subscription-item identifier", () => {
    const subscription = makeSubscription("pro", 2);
    subscription.items.data[1]!.id = "si_replaced_additional";

    assert.throws(
      () =>
        validateSubscription(makeChange("pro", "business", 2), subscription),
      { code: "BILLING_PLAN_STATE_CHANGED" },
    );
  });

  it("rejects a changed source plan or base price", () => {
    assert.throws(
      () => validateSubscription(makeChange(), makeSubscription("business")),
      { code: "BILLING_PLAN_STATE_CHANGED" },
    );

    const subscription = makeSubscription();
    subscription.items.data[0]!.price.id = "price_replaced_starter";

    assert.throws(() => validateSubscription(makeChange(), subscription), {
      code: "BILLING_PLAN_STATE_CHANGED",
    });
  });

  it("rejects changed source additional-user quantity", () => {
    assert.throws(
      () =>
        validateSubscription(
          makeChange("pro", "business", 2),
          makeSubscription("pro", 3),
        ),
      { code: "BILLING_PLAN_STATE_CHANGED" },
    );
  });

  it("rejects cancellation, pending updates, and subscription schedules", () => {
    for (const overrides of [
      { cancel_at_period_end: true },
      { cancel_at: PERIOD_END },
      { pending_update: { expires_at: PERIOD_END } },
      { schedule: "sub_sched_existing" },
    ]) {
      assert.throws(
        () =>
          validateSubscription(makeChange(), {
            ...makeSubscription(),
            ...overrides,
          }),
        { code: "BILLING_PLAN_STATE_CHANGED" },
      );
    }
  });

  it("rejects a trial-to-paid transition after preview", () => {
    assert.throws(
      () =>
        validateSubscription(
          makeChange("starter", "business", 0, 0, true),
          makeSubscription("starter", 0, false),
        ),
      { code: "BILLING_PLAN_STATE_CHANGED" },
    );
  });

  it("rejects a proration date outside the current billing period", () => {
    for (const date of [PERIOD_START - 1, PERIOD_END]) {
      const change = makeChange();

      replaceParameters(change, {
        proration_date: date,
      });

      change.prorationDate = date;

      assert.throws(() => validateSubscription(change, makeSubscription()), {
        code: "BILLING_PLAN_STATE_CHANGED",
      });
    }
  });
});

//************************************************************** */
