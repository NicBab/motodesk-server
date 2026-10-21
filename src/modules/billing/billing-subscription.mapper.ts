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

  if (
    customerId !== expectedCustomerId ||
    subscription.livemode !== expectedLivemode ||
    subscription.metadata.organizationId !==
      expectedOrganizationId ||
    subscription.collection_method !== "charge_automatically" ||
    subscription.items.has_more ||
    subscription.items.data.length !== 1
  ) {
    throw invalidSubscription();
  }

  const item = subscription.items.data[0];

  if (!item || item.quantity !== 1) {
    throw invalidSubscription();
  }

  const price = item.price;

  // Resolve the current plan from its price. Subscription metadata
  // can retain the original plan after a customer-portal upgrade.
  const planId = BILLING_PLAN_IDS.find(
    (id) =>
      getBillingPlan(id).stripeLookupKey === price.lookup_key,
  );

  if (!planId) {
    throw invalidSubscription();
  }

  const plan = getBillingPlan(planId);
  const status = subscriptionStatuses[subscription.status];

  if (
    !status ||
    price.livemode !== expectedLivemode ||
    price.type !== "recurring" ||
    price.billing_scheme !== "per_unit" ||
    price.currency !== plan.currency ||
    subscription.currency !== plan.currency ||
    price.unit_amount !== plan.unitAmount ||
    price.recurring?.interval !== plan.interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    price.transform_quantity !== null ||
    price.custom_unit_amount !== null
  ) {
    throw invalidSubscription();
  }

  const currentPeriodStart = timestampToDate(
    item.current_period_start,
  );

  const currentPeriodEnd = timestampToDate(
    item.current_period_end,
  );

  if (currentPeriodEnd.getTime() <= currentPeriodStart.getTime()) {
    throw invalidSubscription();
  }

  return {
    stripeSubscriptionId: subscription.id,
    stripePriceId: price.id,
    planId,
    status,

    currency: plan.currency,
    unitAmount: plan.unitAmount,

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