
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  BillingLocationCapacityChange,
} from "../../../src/generated/prisma/client.js";

import {
  readBillingLocationCapacityUpdateParameters,
} from "../../../src/modules/billing/billing-location-capacity-parameters.js";

const PRORATION_DATE = Math.floor(Date.now() / 1_000);

function makeChange(
  expected = 0,
  target = 1,
): BillingLocationCapacityChange {
  const now = new Date();

  const items =
    target === 0
      ? [{ id: "si_location", deleted: true }]
      : expected === 0
        ? [{ price: "price_location", quantity: target }]
        : [{ id: "si_location", quantity: target }];

  return {
    id: "00000000-0000-4000-8000-000000000001",
    organizationBillingId: "billing_location",
    requestedByUserId: "user_location",
    status: "QUOTED",
    stripeCustomerId: "cus_location",
    stripeSubscriptionId: "sub_location",
    expectedAdditionalLocationQuantity: expected,
    targetAdditionalLocationQuantity: target,
    expectedLastSyncedAt: null,
    prorationDate: PRORATION_DATE,
    currency: "usd",
    estimatedAmountDue: 1_000n,
    monthlyTotalAmount: 29_900n + BigInt(target) * 4_000n,
    stripeUpdateParameters: {
      items,
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
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

function assertInvalid(
  change: BillingLocationCapacityChange,
): void {
  assert.throws(
    () => readBillingLocationCapacityUpdateParameters(change),
    { code: "BILLING_LOCATION_PREVIEW_REQUIRED" },
  );
}

describe("Billing location-capacity parameters", () => {
  it("accepts adding the first paid location", () => {
    const result =
      readBillingLocationCapacityUpdateParameters(makeChange());

    assert.deepEqual(result.items, [
      { price: "price_location", quantity: 1 },
    ]);
  });

  it("accepts increasing existing location capacity", () => {
    const result =
      readBillingLocationCapacityUpdateParameters(makeChange(1, 3));

    assert.deepEqual(result.items, [
      { id: "si_location", quantity: 3 },
    ]);
  });

  it("accepts removing paid location capacity", () => {
    const result =
      readBillingLocationCapacityUpdateParameters(makeChange(2, 0));

    assert.deepEqual(result.items, [
      { id: "si_location", deleted: true },
    ]);
  });

  it("rejects an unchanged quantity", () => {
    assertInvalid(makeChange(1, 1));
  });

  it("rejects a quantity different from the quote", () => {
    const change = makeChange();
    change.stripeUpdateParameters = {
      items: [{ price: "price_location", quantity: 2 }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
    };

    assertInvalid(change);
  });

  it("rejects payment behavior that could apply unpaid capacity", () => {
    const change = makeChange();
    change.stripeUpdateParameters = {
      items: [{ price: "price_location", quantity: 1 }],
      payment_behavior: "allow_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
    };

    assertInvalid(change);
  });

  it("rejects unexpected subscription update fields", () => {
    const change = makeChange();
    change.stripeUpdateParameters = {
      items: [{ price: "price_location", quantity: 1 }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
      trial_end: "now",
    };

    assertInvalid(change);
  });

  it("rejects a modified proration date", () => {
    const change = makeChange();
    change.prorationDate += 1;

    assertInvalid(change);
  });

  it("rejects replacing an existing item with a new price", () => {
    const change = makeChange(1, 2);
    change.stripeUpdateParameters = {
      items: [{ price: "price_location", quantity: 2 }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: PRORATION_DATE,
    };

    assertInvalid(change);
  });
});
