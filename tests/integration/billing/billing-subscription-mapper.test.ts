import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import type Stripe from "stripe";

import {
  getBillingPlan,
  type BillingPlanId,
} from "../../../src/modules/billing/billing.constants.js";

import {
  mapBillingSubscription,
} from "../../../src/modules/billing/billing-subscription.mapper.js";

//************************************************************** */

const ORGANIZATION_ID = "org_mapper_test";
const CUSTOMER_ID = "cus_mapper_test";
const SUBSCRIPTION_ID = "sub_mapper_test";

const PERIOD_START = 1_767_225_600;
const PERIOD_END = 1_768_435_200;

function makePrice(
  lookupKey: string,
  unitAmount: number,
) {
  return {
    id: `price_${lookupKey}`,
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
  };
}

function makeItem(
  id: string,
  lookupKey: string,
  unitAmount: number,
  quantity: number,
) {
  return {
    id,
    object: "subscription_item",
    quantity,
    current_period_start: PERIOD_START,
    current_period_end: PERIOD_END,
    price: makePrice(lookupKey, unitAmount),
  };
}

function makeSubscription(planId: BillingPlanId = "pro") {
  const plan = getBillingPlan(planId);

  return {
    id: SUBSCRIPTION_ID,
    object: "subscription",
    customer: CUSTOMER_ID,
    livemode: false,
    metadata: {
      organizationId: ORGANIZATION_ID,
    },
    collection_method: "charge_automatically",
    currency: "usd",
    status: "trialing",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    trial_start: PERIOD_START,
    trial_end: PERIOD_END,

    items: {
      object: "list",
      has_more: false,

      data: [
        makeItem(
          "si_base",
          plan.stripeLookupKey,
          plan.unitAmount,
          1,
        ),
      ],
    },
  };
}

function makeAdditionalItem(quantity = 2) {
  return makeItem(
    "si_additional",
    "pro-additional-user-monthly",
    1_000,
    quantity,
  );
}

// Fixtures intentionally include only fields read by the mapper.
function map(input: ReturnType<typeof makeSubscription>) {
  return mapBillingSubscription(
    input as unknown as Stripe.Subscription,
    ORGANIZATION_ID,
    CUSTOMER_ID,
    false,
  );
}

function assertInvalid(
  input: ReturnType<typeof makeSubscription>,
) {
  assert.throws(
    () => map(input),
    {
      code: "BILLING_SUBSCRIPTION_CONFIGURATION_INVALID",
    },
  );
}

//************************************************************** */

describe("Billing subscription item mapping", () => {
  for (const planId of ["starter", "business", "pro"] as const) {
    it(`maps ${planId} without additional users`, () => {
      const result = map(makeSubscription(planId));
      const plan = getBillingPlan(planId);

      assert.equal(result.planId, planId);
      assert.equal(result.unitAmount, plan.unitAmount);
      assert.equal(result.status, "TRIALING");

      assert.equal(result.additionalUserQuantity, 0);
      assert.equal(result.additionalUserUnitAmount, null);
      assert.equal(result.stripeAdditionalUserPriceId, null);
      assert.equal(result.stripeAdditionalUserItemId, null);
    });
  }

  it("maps Pro with two additional users at $10 each", () => {
    const input = makeSubscription();

    input.items.data.push(makeAdditionalItem(2));

    const result = map(input);

    assert.equal(result.planId, "pro");
    assert.equal(result.unitAmount, 29_900);

    assert.equal(result.additionalUserQuantity, 2);
    assert.equal(result.additionalUserUnitAmount, 1_000);

    assert.equal(
      result.stripeAdditionalUserPriceId,
      "price_pro-additional-user-monthly",
    );

    assert.equal(
      result.stripeAdditionalUserItemId,
      "si_additional",
    );

    assert.equal(
      result.unitAmount +
        result.additionalUserQuantity *
          result.additionalUserUnitAmount,
      31_900,
    );

    assert.equal(
      result.currentPeriodStart.getTime(),
      PERIOD_START * 1_000,
    );

    assert.equal(
      result.currentPeriodEnd.getTime(),
      PERIOD_END * 1_000,
    );
  });

  it("finds the base plan when additional users appear first", () => {
    const input = makeSubscription();

    input.items.data.unshift(makeAdditionalItem(3));

    const result = map(input);

    assert.equal(result.planId, "pro");
    assert.equal(result.stripePriceId, "price_pro-monthly");
    assert.equal(result.additionalUserQuantity, 3);
  });

  for (const planId of ["starter", "business"] as const) {
    it(`rejects additional-user items on ${planId}`, () => {
      const input = makeSubscription(planId);

      input.items.data.push(makeAdditionalItem());

      assertInvalid(input);
    });
  }

  it("rejects an additional-user price with the wrong amount", () => {
    const input = makeSubscription();
    const additional = makeAdditionalItem();

    additional.price.unit_amount = 900;
    input.items.data.push(additional);

    assertInvalid(input);
  });

  it("rejects an unexpected additional price lookup key", () => {
    const input = makeSubscription();
    const additional = makeAdditionalItem();

    additional.price.lookup_key = "unknown-additional-price";
    input.items.data.push(additional);

    assertInvalid(input);
  });

  for (const quantity of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2_147_483_648,
  ]) {
    it(`rejects invalid additional-user quantity ${quantity}`, () => {
      const input = makeSubscription();

      input.items.data.push(makeAdditionalItem(quantity));

      assertInvalid(input);
    });
  }

  it("rejects mismatched item billing periods", () => {
    const input = makeSubscription();
    const additional = makeAdditionalItem();

    additional.current_period_end += 86_400;
    input.items.data.push(additional);

    assertInvalid(input);
  });

  it("rejects multiple base-plan items", () => {
    const input = makeSubscription();

    input.items.data.push(
      makeItem(
        "si_other_base",
        "business-monthly",
        18_900,
        1,
      ),
    );

    assertInvalid(input);
  });

  it("rejects multiple additional-user items", () => {
    const input = makeSubscription();
    const secondAdditional = makeAdditionalItem();

    secondAdditional.id = "si_additional_second";

    input.items.data.push(
      makeAdditionalItem(),
      secondAdditional,
    );

    assertInvalid(input);
  });

  it("rejects duplicate subscription item identifiers", () => {
    const input = makeSubscription();
    const additional = makeAdditionalItem();

    additional.id = "si_base";
    input.items.data.push(additional);

    assertInvalid(input);
  });

  it("rejects a base-plan quantity greater than one", () => {
    const input = makeSubscription();

    input.items.data[0]!.quantity = 2;

    assertInvalid(input);
  });

  it("rejects additional-user prices from a different Stripe mode", () => {
    const input = makeSubscription();
    const additional = makeAdditionalItem();

    additional.price.livemode = true;
    input.items.data.push(additional);

    assertInvalid(input);
  });

  it("rejects non-monthly additional-user prices", () => {
    const input = makeSubscription();
    const additional = makeAdditionalItem();

    additional.price.recurring.interval = "year";
    input.items.data.push(additional);

    assertInvalid(input);
  });

  it("rejects metered additional-user prices", () => {
    const input = makeSubscription();
    const additional = makeAdditionalItem();

    additional.price.recurring.usage_type = "metered";
    input.items.data.push(additional);

    assertInvalid(input);
  });

  it("rejects incomplete subscription item lists", () => {
    const input = makeSubscription();

    input.items.has_more = true;

    assertInvalid(input);
  });

  it("rejects a subscription belonging to another organization", () => {
    const input = makeSubscription();

    input.metadata.organizationId = "org_other";

    assertInvalid(input);
  });

  it("rejects a subscription belonging to another customer", () => {
    const input = makeSubscription();

    input.customer = "cus_other";

    assertInvalid(input);
  });

  it("maps inactive historical prices with valid billing terms", () => {
    const input = makeSubscription();
    const additional = makeAdditionalItem();

    input.items.data[0]!.price.active = false;
    additional.price.active = false;
    input.items.data.push(additional);

    const result = map(input);

    assert.equal(result.planId, "pro");
    assert.equal(result.additionalUserQuantity, 2);
  });

  it("clears additional-user values when mapping a base-only subscription", () => {
    const input = makeSubscription();

    input.items.data.push(makeAdditionalItem(4));

    const withAdditionalUsers = map(input);

    assert.equal(withAdditionalUsers.additionalUserQuantity, 4);

    input.items.data = [input.items.data[0]!];

    const baseOnly = map(input);

    assert.equal(baseOnly.additionalUserQuantity, 0);
    assert.equal(baseOnly.additionalUserUnitAmount, null);
    assert.equal(baseOnly.stripeAdditionalUserPriceId, null);
    assert.equal(baseOnly.stripeAdditionalUserItemId, null);
  });
});

//************************************************************** */