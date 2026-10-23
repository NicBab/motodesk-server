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

interface CompletedCheckout {
  operationId: string;
  expectedSessionId: string | null;
}

export interface PreparedBillingSynchronization {
  organizationId: string;
  stripeCustomerId: string;
  expectedLastSyncedAt: Date | null;

  snapshot: BillingSubscriptionSnapshot;
  firstTrialStartedAt: Date | null;

  completedCheckout?: CompletedCheckout;
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

async function prepareCompletedCheckout(
  organizationId: string,
  stripeCustomerId: string,
  operationId: string | null,
  sessionId: string | null,
  subscription: Stripe.Subscription,
): Promise<CompletedCheckout | undefined> {
  // An older subscription must never clear a newer checkout claim.
  if (
    !operationId ||
    subscription.metadata.checkoutOperationId !== operationId
  ) {
    return undefined;
  }

  const stripe = getStripeClient();

  let session: Stripe.Checkout.Session;

  if (sessionId) {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } else {
    // Session creation may have succeeded before its ID was saved.
    const sessions = await stripe.checkout.sessions.list({
      customer: stripeCustomerId,
      limit: 100,
    });

    if (sessions.has_more) {
      throw synchronizationConflict();
    }

    const matches = sessions.data.filter(
      (candidate) =>
        candidate.metadata?.organizationId === organizationId &&
        candidate.metadata?.checkoutOperationId === operationId,
    );

    if (matches.length === 0) {
      // Do not infer completion from an absent session.
      return undefined;
    }

    if (matches.length !== 1) {
      throw synchronizationConflict();
    }

    session = matches[0]!;
  }

  const sessionCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (
    session.mode !== "subscription" ||
    session.livemode !== (env.STRIPE_MODE === "live") ||
    sessionCustomerId !== stripeCustomerId ||
    session.client_reference_id !== organizationId ||
    session.metadata?.organizationId !== organizationId ||
    session.metadata?.checkoutOperationId !== operationId
  ) {
    throw synchronizationConflict();
  }

  // A subscription event can arrive before checkout completes.
  if (session.status !== "complete") {
    return undefined;
  }

  const sessionSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (sessionSubscriptionId !== subscription.id) {
    throw synchronizationConflict();
  }

  return {
    operationId,
    expectedSessionId: sessionId,
  };
}

//************************************************************** */

export async function prepareBillingSynchronization(
  stripeCustomerId: string,
): Promise<PreparedBillingSynchronization | null> {
  // Resolve the tenant through its existing customer mapping.
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

  const selected =
    current[0] ??
    [...subscriptions.data].sort(
      (left, right) =>
        right.created - left.created ||
        right.id.localeCompare(left.id),
    )[0];

  if (!selected) {
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

  // Preserve the first trial across subsequent subscriptions.
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

  const completedCheckout = await prepareCompletedCheckout(
    billing.organizationId,
    stripeCustomerId,
    billing.checkoutOperationId,
    billing.checkoutSessionId,
    selected,
  );

  return {
    organizationId: billing.organizationId,
    stripeCustomerId,
    expectedLastSyncedAt: billing.lastSyncedAt,
    snapshot,
    firstTrialStartedAt,

    ...(completedCheckout ? { completedCheckout } : {}),
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

  void _selectedTrialStartedAt;

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
    // Roll back the subscription update and webhook completion
    // marker when the snapshot baseline is no longer current.
    throw synchronizationConflict();
  }

  const completedCheckout = prepared.completedCheckout;

  if (completedCheckout) {
    // Compare the exact claim observed before contacting Stripe.
    // If another request changed it, preserve the changed claim.
    await transaction.organizationBilling.updateMany({
      where: {
        organizationId: prepared.organizationId,
        stripeCustomerId: prepared.stripeCustomerId,
        stripeSubscriptionId:
          prepared.snapshot.stripeSubscriptionId,
        lastSyncedAt,

        checkoutOperationId: completedCheckout.operationId,
        checkoutSessionId: completedCheckout.expectedSessionId,
      },

      data: {
        checkoutOperationId: null,
        checkoutSessionId: null,
        checkoutSessionExpiresAt: null,
      },
    });
  }
}

//************************************************************** */