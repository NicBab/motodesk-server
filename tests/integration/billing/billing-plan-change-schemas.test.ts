import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import {
  createBillingPlanChangePreviewSchema,
  confirmBillingPlanChangeSchema,
} from "../../../src/modules/billing/billing-plan-change.schemas.js";

//************************************************************** */

const CHANGE_ID = "71ac5c52-ec29-4b80-baf6-2b3512c68760";

//************************************************************** */

describe("Billing plan-change request validation", () => {
  it("accepts supported plans and defaults additional users to zero", () => {
    for (const planId of ["starter", "business", "pro"]) {
      const result = createBillingPlanChangePreviewSchema.parse({
        planId,
      });

      assert.deepEqual(result, {
        planId,
        additionalUserQuantity: 0,
      });
    }
  });

  it("accepts explicit zero additional users on every supported plan", () => {
    for (const planId of ["starter", "business", "pro"]) {
      assert.equal(
        createBillingPlanChangePreviewSchema.safeParse({
          planId,
          additionalUserQuantity: 0,
        }).success,
        true,
      );
    }
  });

  it("accepts a target additional-user quantity on Pro", () => {
    assert.deepEqual(
      createBillingPlanChangePreviewSchema.parse({
        planId: "pro",
        additionalUserQuantity: 2,
      }),
      {
        planId: "pro",
        additionalUserQuantity: 2,
      },
    );
  });

  it("rejects additional users on Starter and Business", () => {
    for (const planId of ["starter", "business"]) {
      const result = createBillingPlanChangePreviewSchema.safeParse({
        planId,
        additionalUserQuantity: 1,
      });

      assert.equal(result.success, false);

      if (!result.success) {
        assert.ok(
          result.error.issues.some(
            (issue) =>
              issue.path[0] === "additionalUserQuantity",
          ),
        );
      }
    }
  });

  it("rejects unsupported or missing plans", () => {
    for (const planId of [
      "enterprise",
      "PRO",
      "",
      null,
      undefined,
      123,
    ]) {
      assert.equal(
        createBillingPlanChangePreviewSchema.safeParse({
          planId,
        }).success,
        false,
      );
    }
  });

  it("rejects invalid additional-user quantities without coercion", () => {
    for (const additionalUserQuantity of [
      -1,
      1.5,
      "2",
      null,
      true,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2_147_483_648,
    ]) {
      assert.equal(
        createBillingPlanChangePreviewSchema.safeParse({
          planId: "pro",
          additionalUserQuantity,
        }).success,
        false,
      );
    }
  });

  it("accepts the maximum database-compatible quantity", () => {
    const result = createBillingPlanChangePreviewSchema.parse({
      planId: "pro",
      additionalUserQuantity: 2_147_483_647,
    });

    assert.equal(
      result.additionalUserQuantity,
      2_147_483_647,
    );
  });

  it("rejects client-controlled pricing and subscription fields", () => {
    const forbiddenFields = {
      organizationId: "another-organization",
      userId: "another-user",
      stripeCustomerId: "cus_client_supplied",
      stripeSubscriptionId: "sub_client_supplied",
      stripePriceId: "price_client_supplied",
      unitAmount: 1,
      monthlyTotalAmount: 1,
      trialDays: 14,
      payment_behavior: "allow_incomplete",
      proration_behavior: "none",
      items: [],
    };

    for (const [key, value] of Object.entries(forbiddenFields)) {
      assert.equal(
        createBillingPlanChangePreviewSchema.safeParse({
          planId: "pro",
          [key]: value,
        }).success,
        false,
        `Preview must reject client-controlled field: ${key}`,
      );
    }
  });

  it("accepts confirmation with only a valid change identifier", () => {
    assert.deepEqual(
      confirmBillingPlanChangeSchema.parse({
        changeId: CHANGE_ID,
      }),
      {
        changeId: CHANGE_ID,
      },
    );
  });

  it("rejects missing or malformed confirmation identifiers", () => {
    for (const changeId of [
      undefined,
      null,
      "",
      "not-a-uuid",
      123,
    ]) {
      assert.equal(
        confirmBillingPlanChangeSchema.safeParse({
          changeId,
        }).success,
        false,
      );
    }
  });

  it("rejects attempts to replace preview values during confirmation", () => {
    const forbiddenFields = {
      planId: "starter",
      additionalUserQuantity: 0,
      organizationId: "another-organization",
      requestedByUserId: "another-user",
      stripeSubscriptionId: "sub_client_supplied",
      stripeUpdateParameters: {
        proration_behavior: "none",
      },
      monthlyTotalAmount: 1,
    };

    for (const [key, value] of Object.entries(forbiddenFields)) {
      assert.equal(
        confirmBillingPlanChangeSchema.safeParse({
          changeId: CHANGE_ID,
          [key]: value,
        }).success,
        false,
        `Confirmation must reject replacement field: ${key}`,
      );
    }
  });

  it("rejects non-object request bodies", () => {
    for (const body of [
      null,
      undefined,
      [],
      "pro",
      123,
      true,
    ]) {
      assert.equal(
        createBillingPlanChangePreviewSchema.safeParse(body).success,
        false,
      );

      assert.equal(
        confirmBillingPlanChangeSchema.safeParse(body).success,
        false,
      );
    }
  });
});

//************************************************************** */