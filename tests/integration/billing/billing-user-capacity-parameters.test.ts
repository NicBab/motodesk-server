import assert from "node:assert/strict";

import {
  beforeEach,
  describe,
  it,
} from "node:test";

import type Stripe from "stripe";

import { env } from "../../../src/config/env.js";

import type {
  BillingUserCapacityChange,
} from "../../../src/generated/prisma/client.js";

import {
  assertBillingUserCapacityUpdateMatchesSubscription,
  readBillingUserCapacityUpdateParameters,
} from "../../../src/modules/billing/billing-user-capacity-parameters.js";

//************************************************************** */

const ORGANIZATION_ID = "org_capacity_parameters";
const CUSTOMER_ID = "cus_capacity_parameters";
const SUBSCRIPTION_ID = "sub_capacity_parameters";

const PERIOD_START = Math.floor(
  new Date("2026-10-01T00:00:00.000Z").getTime() / 1_000,
);

const PERIOD_END = Math.floor(
  new Date("2026-11-01T00:00:00.000Z").getTime() / 1_000,
);

const PRORATION_DATE = Math.floor(
  new Date("2026-10-15T00:00:00.000Z").getTime() / 1_000,
);

function makeChange(
  expectedQuantity = 0,
  targetQuantity = 2,
  trial = false,
): BillingUserCapacityChange {
  const items =
    targetQuantity === 0
      ? [{ id: "si_parameters_additional", deleted: true }]
      : expectedQuantity > 0
        ? [{
            id: "si_parameters_additional",
            quantity: targetQuantity,
          }]
        : [{
            price: "price_parameters_additional",
            quantity: targetQuantity,
          }];

  const now = new Date();

  return {
    id: "00000000-0000-4000-8000-000000000001",
    organizationBillingId: "billing_capacity_parameters",
    requestedByUserId: "user_capacity_parameters",
    status: "QUOTED",

    stripeCustomerId: CUSTOMER_ID,
    stripeSubscriptionId: SUBSCRIPTION_ID,

    expectedAdditionalUserQuantity: expectedQuantity,
    targetAdditionalUserQuantity: targetQuantity,

    expectedLastSyncedAt: null,
    prorationDate: PRORATION_DATE,
    currency: "usd",

    estimatedAmountDue: 500n,
    monthlyTotalAmount:
      29_900n + BigInt(targetQuantity) * 1_000n,

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

function makePrice(
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

function makeSubscription(
  quantity = 0,
  status = "active",
) {
  const items = [
    {
      id: "si_parameters_base",
      quantity: 1,
      current_period_start: PERIOD_START,
      current_period_end: PERIOD_END,
      price: makePrice(
        "price_parameters_pro",
        "pro-monthly",
        29_900,
      ),
    },
  ];

  if (quantity > 0) {
    items.push({
      id: "si_parameters_additional",
      quantity,
      current_period_start: PERIOD_START,
      current_period_end: PERIOD_END,
      price: makePrice(
        "price_parameters_additional",
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
    status,

    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,

    trial_start: status === "trialing" ? PERIOD_START : null,
    trial_end: status === "trialing" ? PERIOD_END : null,

    pending_update: null,
    schedule: null,

    items: {
      has_more: false,
      data: items,
    },
  };
}

// These fixtures contain only the Stripe fields read by validation.
function validateSubscription(
  change: BillingUserCapacityChange,
  subscription: ReturnType<typeof makeSubscription>,
) {
  const parameters =
    readBillingUserCapacityUpdateParameters(change);

  assertBillingUserCapacityUpdateMatchesSubscription(
    ORGANIZATION_ID,
    change,
    parameters,
    subscription as unknown as Stripe.Subscription,
  );
}

function assertInvalidParameters(
  change: BillingUserCapacityChange,
) {
  assert.throws(
    () => readBillingUserCapacityUpdateParameters(change),
    { code: "BILLING_CAPACITY_PREVIEW_REQUIRED" },
  );
}

//************************************************************** */

describe("Billing user-capacity confirmation parameters", () => {
  beforeEach(() => {
    assert.equal(env.STRIPE_MODE, "test");
  });

  it("reads a request to add the first additional-user item", () => {
    const result = readBillingUserCapacityUpdateParameters(
      makeChange(),
    );

    assert.deepEqual(result, {
      items: [
        {
          price: "price_parameters_additional",
          quantity: 2,
        },
      ],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
    });
  });

  it("reads a request to update an existing additional-user item", () => {
    const result = readBillingUserCapacityUpdateParameters(
      makeChange(2, 3),
    );

    assert.deepEqual(result.items, [
      {
        id: "si_parameters_additional",
        quantity: 3,
      },
    ]);
  });

  it("reads a request to remove an existing additional-user item", () => {
    const result = readBillingUserCapacityUpdateParameters(
      makeChange(2, 0),
    );

    assert.deepEqual(result.items, [
      {
        id: "si_parameters_additional",
        deleted: true,
      },
    ]);
  });

  it("reads trial parameters without a proration timestamp", () => {
    const change = makeChange(0, 2, true);

    const result =
      readBillingUserCapacityUpdateParameters(change);

    assert.equal(result.proration_behavior, "none");
    assert.equal(
      Object.hasOwn(result, "proration_date"),
      false,
    );

    validateSubscription(
      change,
      makeSubscription(0, "trialing"),
    );
  });

  it("rejects unexpected stored request parameters", () => {
    const change = makeChange();

    change.stripeUpdateParameters = {
      items: [{
        price: "price_parameters_additional",
        quantity: 2,
      }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
      trial_end: "now",
    };

    assertInvalidParameters(change);
  });

  it("rejects an item quantity different from the confirmed target", () => {
    const change = makeChange();

    change.stripeUpdateParameters = {
      items: [{
        price: "price_parameters_additional",
        quantity: 3,
      }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
    };

    assertInvalidParameters(change);
  });

  it("rejects a payment behavior that could apply unpaid capacity", () => {
    const change = makeChange();

    change.stripeUpdateParameters = {
      items: [{
        price: "price_parameters_additional",
        quantity: 2,
      }],
      payment_behavior: "allow_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
    };

    assertInvalidParameters(change);
  });

  it("rejects a proration timestamp different from the preview", () => {
    const change = makeChange();
    change.prorationDate += 1;

    assertInvalidParameters(change);
  });

  it("rejects a monthly total that differs from catalog pricing", () => {
    const change = makeChange();
    change.monthlyTotalAmount = 1n;

    assertInvalidParameters(change);
  });

  it("rejects an unchanged target quantity", () => {
    assertInvalidParameters(makeChange(2, 2));
  });

  it("accepts a matching current Pro subscription", () => {
    validateSubscription(
      makeChange(2, 3),
      makeSubscription(2),
    );
  });

  it("rejects a changed current additional-user quantity", () => {
    assert.throws(
      () => validateSubscription(
        makeChange(2, 3),
        makeSubscription(1),
      ),
      { code: "BILLING_CAPACITY_STATE_CHANGED" },
    );
  });

  it("rejects a stale additional-user item identifier", () => {
    const subscription = makeSubscription(2);
    subscription.items.data[1]!.id = "si_replaced_additional";

    assert.throws(
      () => validateSubscription(
        makeChange(2, 3),
        subscription,
      ),
      { code: "BILLING_CAPACITY_STATE_CHANGED" },
    );
  });

  it("rejects a preview timestamp outside the current billing period", () => {
    const change = makeChange();
    change.prorationDate = PERIOD_END;

    change.stripeUpdateParameters = {
      items: [{
        price: "price_parameters_additional",
        quantity: 2,
      }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PERIOD_END,
    };

    assert.throws(
      () => validateSubscription(
        change,
        makeSubscription(),
      ),
      { code: "BILLING_CAPACITY_STATE_CHANGED" },
    );
  });

  it("rejects a subscription with scheduled cancellation", () => {
    const subscription = makeSubscription();
    subscription.cancel_at_period_end = true;

    assert.throws(
      () => validateSubscription(
        makeChange(),
        subscription,
      ),
      { code: "BILLING_CAPACITY_STATE_CHANGED" },
    );
  });

  it("rejects a subscription with an existing pending update", () => {
    const subscription = {
      ...makeSubscription(),
      pending_update: {
        expires_at: PERIOD_END,
      },
    };

    assert.throws(
      () => {
        const change = makeChange();

        assertBillingUserCapacityUpdateMatchesSubscription(
          ORGANIZATION_ID,
          change,
          readBillingUserCapacityUpdateParameters(change),
          subscription as unknown as Stripe.Subscription,
        );
      },
      { code: "BILLING_CAPACITY_STATE_CHANGED" },
    );
  });

  it("rejects a change from trial billing to paid billing after preview", () => {
    assert.throws(
      () => validateSubscription(
        makeChange(0, 2, true),
        makeSubscription(0, "active"),
      ),
      { code: "BILLING_CAPACITY_STATE_CHANGED" },
    );
  });

  it("rejects a subscription belonging to another organization", () => {
    const subscription = makeSubscription();

    subscription.metadata.organizationId = "org_other";

    assert.throws(
      () => validateSubscription(
        makeChange(),
        subscription,
      ),
      { code: "BILLING_SUBSCRIPTION_CONFIGURATION_INVALID" },
    );
  });
});

//************************************************************** */