import type Stripe from "stripe";

import { env } from "../../config/env.js";

import { prisma } from "../../config/prisma.js";

import { getStripeClient } from "../../config/stripe.js";

import type {
  Prisma,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  mapBillingSubscription,
  type BillingSubscriptionSnapshot,
} from "./billing-subscription.mapper.js";

//************************************************************** */

export interface PreparedBillingSynchronization {
  organizationId: string;
  stripeCustomerId: string;
  expectedLastSyncedAt: Date | null;

  snapshot: BillingSubscriptionSnapshot;

  firstTrialStartedAt: Date | null;
}

//************************************************************** */

function synchronizationConflict(): AppError {
  return new AppError(
    503,
    "Billing synchronization must be retried.",
    {
      code: "BILLING_SYNC_RETRY_REQUIRED",
    },
  );
}

function isCurrentSubscription(
  subscription: Stripe.Subscription,
): boolean {
  return (
    subscription.status !== "canceled" &&
    subscription.status !== "incomplete_expired"
  );
}

//************************************************************** */

export async function prepareBillingSynchronization(
  stripeCustomerId: string,
): Promise<PreparedBillingSynchronization | null> {
  // Resolve organizations through the existing customer mapping.
  // Never create or select an organization from event metadata alone.
  const billing = await prisma.organizationBilling.findUnique({
    where: {
      stripeCustomerId,
    },
  });

  if (!billing) {
    return null;
  }

  const stripe = getStripeClient();

  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 100,
  });

  // Do not synchronize from an incomplete view of customer history.
  if (subscriptions.has_more) {
    throw new AppError(
      409,
      "The organization subscription history requires review.",
      {
        code: "BILLING_SUBSCRIPTION_REVIEW_REQUIRED",
      },
    );
  }

  const current = subscriptions.data.filter(
    isCurrentSubscription,
  );

  if (current.length > 1) {
    throw new AppError(
      409,
      "Multiple subscriptions require billing review.",
      {
        code: "BILLING_MULTIPLE_SUBSCRIPTIONS",
      },
    );
  }

  // Prefer the current subscription. If all subscriptions ended,
  // retain the latest subscription's terminal state.
  const selected =
    current[0] ??
    [...subscriptions.data].sort(
      (left, right) =>
        right.created - left.created ||
        right.id.localeCompare(left.id),
    )[0];

  if (!selected) {
    // An existing mapped customer without subscriptions has no
    // subscription state to apply. Initial state stays unsubscribed.
    if (billing.stripeSubscriptionId !== null) {
      throw synchronizationConflict();
    }

    return null;
  }

  const snapshot = mapBillingSubscription(
    selected,
    billing.organizationId,
    stripeCustomerId,
    env.STRIPE_MODE === "live",
  );

  // Preserve evidence of the first trial across resubscriptions.
  let firstTrialStartedAt = billing.trialStartedAt;

  for (const subscription of subscriptions.data) {
    const timestamp = subscription.trial_start;

    if (timestamp === null) {
      continue;
    }

    if (
      subscription.metadata.organizationId !==
        billing.organizationId ||
      subscription.livemode !== (env.STRIPE_MODE === "live") ||
      !Number.isSafeInteger(timestamp) ||
      timestamp < 0
    ) {
      throw synchronizationConflict();
    }

    const startedAt = new Date(timestamp * 1_000);

    if (!Number.isFinite(startedAt.getTime())) {
      throw synchronizationConflict();
    }

    if (
      firstTrialStartedAt === null ||
      startedAt.getTime() < firstTrialStartedAt.getTime()
    ) {
      firstTrialStartedAt = startedAt;
    }
  }

  return {
    organizationId: billing.organizationId,
    stripeCustomerId,
    expectedLastSyncedAt: billing.lastSyncedAt,
    snapshot,
    firstTrialStartedAt,
  };
}

//************************************************************** */

export async function applyBillingSynchronization(
  transaction: Prisma.TransactionClient,
  prepared: PreparedBillingSynchronization,
): Promise<void> {
  const {
    trialStartedAt: _selectedTrialStartedAt,
    ...subscriptionFields
  } = prepared.snapshot;

  // The historical first trial is preserved separately.
  void _selectedTrialStartedAt;

  // Ensure every successful synchronization advances this value,
  // including two updates occurring within the same millisecond.
  const lastSyncedAt = new Date(
    Math.max(
      Date.now(),
      (prepared.expectedLastSyncedAt?.getTime() ?? 0) + 1,
    ),
  );

  const result = await transaction.organizationBilling.updateMany({
    where: {
      organizationId: prepared.organizationId,
      stripeCustomerId: prepared.stripeCustomerId,
      lastSyncedAt: prepared.expectedLastSyncedAt,
    },

    data: {
      ...subscriptionFields,

      trialStartedAt: prepared.firstTrialStartedAt,

      lastSyncedAt,
    },
  });

  if (result.count !== 1) {
    // Throwing rolls back both billing changes and the webhook
    // completion marker when called inside its transaction.
    throw synchronizationConflict();
  }
}

//************************************************************** */