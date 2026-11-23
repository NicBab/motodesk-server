
import { z } from "zod";

import type Stripe from "stripe";

import { env } from "../../config/env.js";

import type {
  BillingLocationCapacityChange,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  getBillingPlan,
} from "./billing.constants.js";

import {
  mapBillingSubscription,
} from "./billing-subscription.mapper.js";

const quantitySchema = z.number().int().min(1).max(2_147_483_647);

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
  proration_behavior: z.enum(["none", "always_invoice"]),
  proration_date: z.number().int().nonnegative().optional(),
});

function invalidParameters(): AppError {
  return new AppError(
    409,
    "Request a new location-capacity preview.",
    { code: "BILLING_LOCATION_PREVIEW_REQUIRED" },
  );
}

function stateChanged(): AppError {
  return new AppError(
    409,
    "The subscription changed after this preview. Refresh billing.",
    { code: "BILLING_LOCATION_STATE_CHANGED" },
  );
}

export function readBillingLocationCapacityUpdateParameters(
  change: BillingLocationCapacityChange,
): Stripe.SubscriptionUpdateParams {
  const parsed = storedParametersSchema.safeParse(
    change.stripeUpdateParameters,
  );

  if (!parsed.success) {
    throw invalidParameters();
  }

  const parameters = parsed.data;
  const item = parameters.items[0]!;

  const expected = change.expectedAdditionalLocationQuantity;
  const target = change.targetAdditionalLocationQuantity;

  if (
    !Number.isSafeInteger(expected) ||
    !Number.isSafeInteger(target) ||
    expected < 0 ||
    target < 0 ||
    expected === target
  ) {
    throw invalidParameters();
  }

  if (target === 0) {
    if (expected === 0 || !("deleted" in item)) {
      throw invalidParameters();
    }
  } else {
    if (!("quantity" in item) || item.quantity !== target) {
      throw invalidParameters();
    }

    if (expected === 0) {
      if (!("price" in item)) {
        throw invalidParameters();
      }
    } else if (!("id" in item)) {
      throw invalidParameters();
    }
  }

  if (parameters.proration_behavior === "always_invoice") {
    if (parameters.proration_date !== change.prorationDate) {
      throw invalidParameters();
    }
  } else if (parameters.proration_date !== undefined) {
    throw invalidParameters();
  }

  const plan = getBillingPlan("pro");

  if (
    !plan.additionalLocationPricing ||
    change.currency !== plan.currency
  ) {
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

export function assertBillingLocationCapacityUpdateMatchesSubscription(
  organizationId: string,
  change: BillingLocationCapacityChange,
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
    (snapshot.status !== "ACTIVE" &&
      snapshot.status !== "TRIALING") ||
    snapshot.additionalLocationQuantity !==
      change.expectedAdditionalLocationQuantity ||
    subscription.cancel_at_period_end ||
    subscription.cancel_at !== null ||
    subscription.pending_update ||
    subscription.schedule
  ) {
    throw stateChanged();
  }

  const plan = getBillingPlan("pro");

  if (
    !plan.additionalLocationPricing ||
    change.monthlyTotalAmount !== BigInt(
      plan.unitAmount +
      snapshot.additionalUserQuantity *
        (plan.additionalUserPricing?.unitAmount ?? 0) +
      change.targetAdditionalLocationQuantity *
        plan.additionalLocationPricing.unitAmount,
    )
  ) {
    throw stateChanged();
  }

  const expectedProration =
    snapshot.status === "TRIALING"
      ? "none"
      : "always_invoice";

  if (
    parameters.proration_behavior !== expectedProration ||
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
    change.expectedAdditionalLocationQuantity > 0 &&
    item.id !== snapshot.stripeAdditionalLocationItemId
  ) {
    throw stateChanged();
  }
}
