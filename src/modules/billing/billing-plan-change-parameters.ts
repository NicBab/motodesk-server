import { z } from "zod";

import type Stripe from "stripe";

import { env } from "../../config/env.js";

import type {
  BillingPlanChange,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  getBillingPlan,
  isBillingPlanId,
} from "./billing.constants.js";

import {
  mapBillingSubscription,
} from "./billing-subscription.mapper.js";

//************************************************************** */

const identifierSchema = z.string().min(1);

const quantitySchema = z
  .number()
  .int()
  .min(1)
  .max(2_147_483_647);

const baseItemSchema = z.strictObject({
  id: identifierSchema,
  price: identifierSchema,
  quantity: z.literal(1),
});

const additionalItemSchema = z.union([
  z.strictObject({
    price: identifierSchema,
    quantity: quantitySchema,
  }),

  z.strictObject({
    id: identifierSchema,
    deleted: z.literal(true),
  }),
]);

const storedParametersSchema = z.strictObject({
  items: z.union([
    z.tuple([baseItemSchema]),
    z.tuple([baseItemSchema, additionalItemSchema]),
  ]),

  payment_behavior: z.literal("pending_if_incomplete"),

  proration_behavior: z.enum([
    "none",
    "always_invoice",
  ]),

  proration_date: z
    .number()
    .int()
    .nonnegative()
    .optional(),
});

//************************************************************** */

function invalidParameters(): AppError {
  return new AppError(
    409,
    "Request a new plan-change preview before continuing.",
    {
      code: "BILLING_PLAN_PREVIEW_REQUIRED",
    },
  );
}

function stateChanged(): AppError {
  return new AppError(
    409,
    "The subscription changed after this preview. Refresh billing and request a new preview.",
    {
      code: "BILLING_PLAN_STATE_CHANGED",
    },
  );
}

function isValidQuantity(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 2_147_483_647
  );
}

//************************************************************** */

export function readBillingPlanChangeUpdateParameters(
  change: BillingPlanChange,
): Stripe.SubscriptionUpdateParams {
  const parsed = storedParametersSchema.safeParse(
    change.stripeUpdateParameters,
  );

  if (!parsed.success) {
    throw invalidParameters();
  }

  if (
    !isBillingPlanId(change.expectedPlanId) ||
    !isBillingPlanId(change.targetPlanId) ||
    change.expectedPlanId === change.targetPlanId ||
    !isValidQuantity(change.expectedAdditionalUserQuantity) ||
    !isValidQuantity(change.targetAdditionalUserQuantity) ||
    (
      change.expectedPlanId !== "pro" &&
      change.expectedAdditionalUserQuantity !== 0
    ) ||
    (
      change.targetPlanId !== "pro" &&
      change.targetAdditionalUserQuantity !== 0
    ) ||
    !change.expectedStripePriceId ||
    !Number.isSafeInteger(change.prorationDate) ||
    change.prorationDate < 0
  ) {
    throw invalidParameters();
  }

  const parameters = parsed.data;
  const baseItem = parameters.items[0];
  const additionalItem = parameters.items[1];

  const targetPlan = getBillingPlan(change.targetPlanId);

  const expectedMonthlyTotal =
    BigInt(targetPlan.unitAmount) +
    BigInt(change.targetAdditionalUserQuantity) *
      BigInt(targetPlan.additionalUserPricing?.unitAmount ?? 0);

  if (
    change.currency !== targetPlan.currency ||
    change.monthlyTotalAmount !== expectedMonthlyTotal ||
    expectedMonthlyTotal > BigInt(Number.MAX_SAFE_INTEGER) ||
    change.estimatedAmountDue < 0n ||
    change.estimatedAmountDue > BigInt(Number.MAX_SAFE_INTEGER) ||
    baseItem.price === change.expectedStripePriceId
  ) {
    throw invalidParameters();
  }

  if (change.expectedAdditionalUserQuantity > 0) {
    // A cross-plan change from Pro must remove its existing
    // additional-user item in the same request.
    if (
      !additionalItem ||
      !("deleted" in additionalItem) ||
      additionalItem.id === baseItem.id
    ) {
      throw invalidParameters();
    }
  } else if (change.targetAdditionalUserQuantity > 0) {
    // A cross-plan change to Pro creates its additional-user
    // item only when the requested quantity is positive.
    if (
      !additionalItem ||
      !("price" in additionalItem) ||
      additionalItem.quantity !==
        change.targetAdditionalUserQuantity ||
      additionalItem.price === baseItem.price
    ) {
      throw invalidParameters();
    }
  } else if (additionalItem !== undefined) {
    throw invalidParameters();
  }

  if (parameters.proration_behavior === "always_invoice") {
    if (parameters.proration_date !== change.prorationDate) {
      throw invalidParameters();
    }
  } else if (parameters.proration_date !== undefined) {
    throw invalidParameters();
  }

  return {
    items: parameters.items,
    payment_behavior: parameters.payment_behavior,
    proration_behavior: parameters.proration_behavior,

    ...(parameters.proration_date !== undefined
      ? { proration_date: parameters.proration_date }
      : {}),
  };
}

//************************************************************** */

// Validate immediately before submission.
//
// Retry handling must first reconcile whether Stripe already
// applied the requested change or is awaiting payment.
//
// This function reads the immutable stored parameters itself.
export function assertBillingPlanChangeUpdateMatchesSubscription(
  organizationId: string,
  change: BillingPlanChange,
  subscription: Stripe.Subscription,
): void {
  const parameters = readBillingPlanChangeUpdateParameters(change);

  if (subscription.id !== change.stripeSubscriptionId) {
    throw stateChanged();
  }

  const snapshot = mapBillingSubscription(
    subscription,
    organizationId,
    change.stripeCustomerId,
    env.STRIPE_MODE === "live",
  );

  if (
    snapshot.planId !== change.expectedPlanId ||
    snapshot.stripePriceId !== change.expectedStripePriceId ||
    snapshot.additionalUserQuantity !==
      change.expectedAdditionalUserQuantity ||
    (
      snapshot.status !== "ACTIVE" &&
      snapshot.status !== "TRIALING"
    ) ||
    subscription.cancel_at_period_end ||
    subscription.cancel_at !== null ||
    subscription.pending_update ||
    subscription.schedule
  ) {
    throw stateChanged();
  }

  const expectedProrationBehavior =
    snapshot.status === "TRIALING"
      ? "none"
      : "always_invoice";

  if (
    parameters.proration_behavior !== expectedProrationBehavior ||
    change.prorationDate <
      snapshot.currentPeriodStart.getTime() / 1_000 ||
    change.prorationDate >=
      snapshot.currentPeriodEnd.getTime() / 1_000
  ) {
    throw stateChanged();
  }

  const currentBaseItem = subscription.items.data.find(
    (item) => item.price.id === snapshot.stripePriceId,
  );

  const baseUpdate = parameters.items?.[0];

  if (
    !currentBaseItem?.id ||
    !baseUpdate ||
    baseUpdate.id !== currentBaseItem.id
  ) {
    throw stateChanged();
  }

  if (change.expectedAdditionalUserQuantity > 0) {
    const additionalUpdate = parameters.items?.[1];

    if (
      !snapshot.stripeAdditionalUserItemId ||
      additionalUpdate?.id !==
        snapshot.stripeAdditionalUserItemId
    ) {
      throw stateChanged();
    }
  }
}

//************************************************************** */