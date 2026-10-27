import { z } from "zod";

import type Stripe from "stripe";

import type {
  BillingUserCapacityChange,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  getBillingPlan,
} from "./billing.constants.js";

import {
  mapBillingSubscription,
} from "./billing-subscription.mapper.js";

import { env } from "../../config/env.js";

//************************************************************** */

const quantitySchema = z
  .number()
  .int()
  .min(1)
  .max(2_147_483_647);

const storedParametersSchema = z.strictObject({
  items: z.array(
    z.union([
      z.strictObject({
        price: z.string().min(1),
        quantity: quantitySchema,
      }),

      z.strictObject({
        id: z.string().min(1),
        quantity: quantitySchema,
      }),

      z.strictObject({
        id: z.string().min(1),
        deleted: z.literal(true),
      }),
    ]),
  ).length(1),

  payment_behavior: z.literal("pending_if_incomplete"),

  proration_behavior: z.enum([
    "none",
    "always_invoice",
  ]),

  proration_date: z.number().int().nonnegative().optional(),
});

//************************************************************** */

function invalidParameters(): AppError {
  return new AppError(
    409,
    "Request a new user-capacity preview before continuing.",
    {
      code: "BILLING_CAPACITY_PREVIEW_REQUIRED",
    },
  );
}

function stateChanged(): AppError {
  return new AppError(
    409,
    "The subscription changed after this preview. Refresh billing and request a new preview.",
    {
      code: "BILLING_CAPACITY_STATE_CHANGED",
    },
  );
}

//************************************************************** */

export function readBillingUserCapacityUpdateParameters(
  change: BillingUserCapacityChange,
): Stripe.SubscriptionUpdateParams {
  const parsed = storedParametersSchema.safeParse(
    change.stripeUpdateParameters,
  );

  if (!parsed.success) {
    throw invalidParameters();
  }

  const parameters = parsed.data;
  const item = parameters.items[0]!;

  const expectedQuantity = change.expectedAdditionalUserQuantity;
  const targetQuantity = change.targetAdditionalUserQuantity;

  for (const quantity of [expectedQuantity, targetQuantity]) {
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > 2_147_483_647
    ) {
      throw invalidParameters();
    }
  }

  if (expectedQuantity === targetQuantity) {
    throw invalidParameters();
  }

  const plan = getBillingPlan("pro");
  const pricing = plan.additionalUserPricing;

  if (
    !pricing ||
    change.currency !== plan.currency ||
    change.monthlyTotalAmount !==
      BigInt(plan.unitAmount + targetQuantity * pricing.unitAmount)
  ) {
    throw invalidParameters();
  }

  if (targetQuantity === 0) {
    if (!("deleted" in item) || expectedQuantity === 0) {
      throw invalidParameters();
    }
  } else {
    if (
      !("quantity" in item) ||
      item.quantity !== targetQuantity
    ) {
      throw invalidParameters();
    }

    if (expectedQuantity === 0) {
      if (!("price" in item)) {
        throw invalidParameters();
      }
    } else if (!("id" in item)) {
      throw invalidParameters();
    }
  }

  if (parameters.proration_behavior === "always_invoice") {
    if (
      !Number.isSafeInteger(change.prorationDate) ||
      parameters.proration_date !== change.prorationDate
    ) {
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

// Validate immediately before submission. Retry reconciliation
// must first check whether Stripe already applied the change.
export function assertBillingUserCapacityUpdateMatchesSubscription(
  organizationId: string,
  change: BillingUserCapacityChange,
  parameters: Stripe.SubscriptionUpdateParams,
  subscription: Stripe.Subscription,
): void {
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
    snapshot.planId !== "pro" ||
    (
      snapshot.status !== "ACTIVE" &&
      snapshot.status !== "TRIALING"
    ) ||
    snapshot.additionalUserQuantity !==
      change.expectedAdditionalUserQuantity ||
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

  const item = parameters.items?.[0];

  if (!item) {
    throw invalidParameters();
  }

  if (
    change.expectedAdditionalUserQuantity > 0 &&
    item.id !== snapshot.stripeAdditionalUserItemId
  ) {
    throw stateChanged();
  }
}

//************************************************************** */