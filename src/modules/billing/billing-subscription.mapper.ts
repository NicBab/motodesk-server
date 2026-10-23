import type Stripe from "stripe";

import {
  BillingSubscriptionStatus,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  BILLING_PLAN_IDS,
  getBillingPlan,
  type BillingPlanId,
} from "./billing.constants.js";

//************************************************************** */

const subscriptionStatuses: Readonly<
  Partial<Record<string, BillingSubscriptionStatus>>
> = {
  incomplete: BillingSubscriptionStatus.INCOMPLETE,
  incomplete_expired: BillingSubscriptionStatus.INCOMPLETE_EXPIRED,
  trialing: BillingSubscriptionStatus.TRIALING,
  active: BillingSubscriptionStatus.ACTIVE,
  past_due: BillingSubscriptionStatus.PAST_DUE,
  canceled: BillingSubscriptionStatus.CANCELED,
  unpaid: BillingSubscriptionStatus.UNPAID,
  paused: BillingSubscriptionStatus.PAUSED,
};

//************************************************************** */

export interface BillingSubscriptionSnapshot {
  stripeSubscriptionId: string;
  stripePriceId: string;
  planId: BillingPlanId;

  status: BillingSubscriptionStatus;

  currency: string;
  unitAmount: number;

  additionalUserQuantity: number;
  additionalUserUnitAmount: number | null;
  stripeAdditionalUserPriceId: string | null;
  stripeAdditionalUserItemId: string | null;

  currentPeriodStart: Date;
  currentPeriodEnd: Date;

  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;

  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
}

//************************************************************** */

function invalidSubscription(): AppError {
  return new AppError(
    409,
    "The organization subscription requires review.",
    {
      code: "BILLING_SUBSCRIPTION_CONFIGURATION_INVALID",
    },
  );
}

function timestampToDate(value: number): Date {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw invalidSubscription();
  }

  const date = new Date(value * 1_000);

  if (!Number.isFinite(date.getTime())) {
    throw invalidSubscription();
  }

  return date;
}

function nullableTimestampToDate(
  value: number | null,
): Date | null {
  return value === null ? null : timestampToDate(value);
}

function assertExpectedPrice(
  price: Stripe.Price,
  lookupKey: string,
  unitAmount: number,
  currency: string,
  interval: "month",
  expectedLivemode: boolean,
): void {
  // Historical subscriptions can reference inactive prices.
  // Validate their billing terms without requiring active=true.
  if (
    !price.id ||
    price.lookup_key !== lookupKey ||
    price.livemode !== expectedLivemode ||
    price.type !== "recurring" ||
    price.billing_scheme !== "per_unit" ||
    price.currency !== currency ||
    price.unit_amount !== unitAmount ||
    price.recurring?.interval !== interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    price.transform_quantity !== null ||
    price.custom_unit_amount !== null
  ) {
    throw invalidSubscription();
  }
}

//************************************************************** */

export function mapBillingSubscription(
  subscription: Stripe.Subscription,
  expectedOrganizationId: string,
  expectedCustomerId: string,
  expectedLivemode: boolean,
): BillingSubscriptionSnapshot {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const items = subscription.items.data;

  if (
    customerId !== expectedCustomerId ||
    subscription.livemode !== expectedLivemode ||
    subscription.metadata.organizationId !==
      expectedOrganizationId ||
    subscription.collection_method !== "charge_automatically" ||
    subscription.items.has_more ||
    items.length < 1 ||
    items.length > 2
  ) {
    throw invalidSubscription();
  }

  // Find the base plan by its price rather than item order or
  // subscription metadata, which can retain a previous plan.
  const baseItems = items.filter((item) =>
    BILLING_PLAN_IDS.some(
      (id) =>
        getBillingPlan(id).stripeLookupKey ===
        item.price.lookup_key,
    ),
  );

  if (baseItems.length !== 1) {
    throw invalidSubscription();
  }

  const baseItem = baseItems[0]!;

  if (baseItem.quantity !== 1) {
    throw invalidSubscription();
  }

  const planId = BILLING_PLAN_IDS.find(
    (id) =>
      getBillingPlan(id).stripeLookupKey ===
      baseItem.price.lookup_key,
  );

  if (!planId) {
    throw invalidSubscription();
  }

  const plan = getBillingPlan(planId);
  const status = subscriptionStatuses[subscription.status];

  if (!status || subscription.currency !== plan.currency) {
    throw invalidSubscription();
  }

  assertExpectedPrice(
    baseItem.price,
    plan.stripeLookupKey,
    plan.unitAmount,
    plan.currency,
    plan.interval,
    expectedLivemode,
  );

  const currentPeriodStart = timestampToDate(
    baseItem.current_period_start,
  );

  const currentPeriodEnd = timestampToDate(
    baseItem.current_period_end,
  );

  if (
    currentPeriodEnd.getTime() <=
    currentPeriodStart.getTime()
  ) {
    throw invalidSubscription();
  }

  let additionalUserQuantity = 0;
  let additionalUserUnitAmount: number | null = null;
  let stripeAdditionalUserPriceId: string | null = null;
  let stripeAdditionalUserItemId: string | null = null;

  const additionalItems = items.filter(
    (item) => item !== baseItem,
  );

  if (additionalItems.length > 0) {
    const additionalItem = additionalItems[0]!;
    const pricing = plan.additionalUserPricing;
    const quantity = additionalItem.quantity;

    if (
      !pricing ||
      additionalItems.length !== 1 ||
      !additionalItem.id ||
      additionalItem.id === baseItem.id ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 2_147_483_647
    ) {
      throw invalidSubscription();
    }

    assertExpectedPrice(
      additionalItem.price,
      pricing.stripeLookupKey,
      pricing.unitAmount,
      plan.currency,
      plan.interval,
      expectedLivemode,
    );

    // Keep both recurring items on one billing period.
    if (
      additionalItem.current_period_start !==
        baseItem.current_period_start ||
      additionalItem.current_period_end !==
        baseItem.current_period_end ||
      !Number.isSafeInteger(
        plan.unitAmount + quantity * pricing.unitAmount,
      )
    ) {
      throw invalidSubscription();
    }

    additionalUserQuantity = quantity;
    additionalUserUnitAmount = pricing.unitAmount;
    stripeAdditionalUserPriceId = additionalItem.price.id;
    stripeAdditionalUserItemId = additionalItem.id;
  }

  return {
    stripeSubscriptionId: subscription.id,
    stripePriceId: baseItem.price.id,
    planId,
    status,

    currency: plan.currency,
    unitAmount: plan.unitAmount,

    additionalUserQuantity,
    additionalUserUnitAmount,
    stripeAdditionalUserPriceId,
    stripeAdditionalUserItemId,

    currentPeriodStart,
    currentPeriodEnd,

    cancelAtPeriodEnd: subscription.cancel_at_period_end,

    cancelAt: nullableTimestampToDate(subscription.cancel_at),

    canceledAt: nullableTimestampToDate(
      subscription.canceled_at,
    ),

    endedAt: nullableTimestampToDate(subscription.ended_at),

    trialStartedAt: nullableTimestampToDate(
      subscription.trial_start,
    ),

    trialEndsAt: nullableTimestampToDate(
      subscription.trial_end,
    ),
  };
}

//************************************************************** */