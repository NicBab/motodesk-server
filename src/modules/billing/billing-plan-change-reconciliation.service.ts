import type Stripe from "stripe";

import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { getStripeClient } from "../../config/stripe.js";

import type {
  BillingPlanChange,
  Prisma,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  lockOrganizationUserCapacity,
} from "./billing-capacity.service.js";

import {
  readBillingPlanChangeUpdateParameters,
} from "./billing-plan-change-parameters.js";

import {
  mapBillingSubscription,
  type BillingSubscriptionSnapshot,
} from "./billing-subscription.mapper.js";

import type {
  PreparedBillingSynchronization,
} from "./billing-sync.service.js";

//************************************************************** */

export interface PreparedPlanChangeReconciliation {
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  changeId: string;

  outcome:
    | "APPLIED"
    | "PENDING_PAYMENT"
    | "EXPIRED"
    | "RECONCILIATION_REQUIRED";

  stripeInvoiceId: string | null;
}

//************************************************************** */

function retryRequired(): AppError {
  return new AppError(
    503,
    "Plan-change reconciliation must be retried.",
    {
      code: "BILLING_PLAN_RECONCILIATION_RETRY_REQUIRED",
    },
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0
  ) {
    return value.id;
  }

  return null;
}

function matchesSource(
  change: BillingPlanChange,
  snapshot: BillingSubscriptionSnapshot,
): boolean {
  return (
    snapshot.planId === change.expectedPlanId &&
    snapshot.stripePriceId === change.expectedStripePriceId &&
    snapshot.additionalUserQuantity ===
      change.expectedAdditionalUserQuantity &&
    (
      snapshot.status === "ACTIVE" ||
      snapshot.status === "TRIALING"
    )
  );
}

function matchesTarget(
  change: BillingPlanChange,
  snapshot: BillingSubscriptionSnapshot,
): boolean {
  const parameters = readBillingPlanChangeUpdateParameters(change);

  if (
    snapshot.planId !== change.targetPlanId ||
    snapshot.stripePriceId !== parameters.items?.[0]?.price ||
    snapshot.additionalUserQuantity !==
      change.targetAdditionalUserQuantity ||
    snapshot.currency !== change.currency ||
    (
      snapshot.status !== "ACTIVE" &&
      snapshot.status !== "TRIALING"
    )
  ) {
    return false;
  }

  if (change.targetAdditionalUserQuantity > 0) {
    if (
      !snapshot.stripeAdditionalUserItemId ||
      snapshot.additionalUserUnitAmount === null ||
      snapshot.stripeAdditionalUserPriceId !==
        parameters.items?.[1]?.price
    ) {
      return false;
    }
  } else if (
    snapshot.additionalUserUnitAmount !== null ||
    snapshot.stripeAdditionalUserPriceId !== null ||
    snapshot.stripeAdditionalUserItemId !== null
  ) {
    return false;
  }

  return (
    BigInt(snapshot.unitAmount) +
      BigInt(snapshot.additionalUserQuantity) *
        BigInt(snapshot.additionalUserUnitAmount ?? 0) ===
    change.monthlyTotalAmount
  );
}

//************************************************************** */

// Only call with an event that passed signature verification.
// All provider reads happen before the database transaction.
export async function prepareBillingPlanChangeReconciliation(
  event: Stripe.Event,
  prepared: PreparedBillingSynchronization,
): Promise<PreparedPlanChangeReconciliation | null> {
  if (
    event.livemode !== (env.STRIPE_MODE === "live") ||
    event.account
  ) {
    throw retryRequired();
  }

  const billing = await prisma.organizationBilling.findUnique({
    where: {
      organizationId: prepared.organizationId,
    },
  });

  if (!billing?.activePlanChangeId) {
    return null;
  }

  if (billing.activeUserCapacityChangeId) {
    throw retryRequired();
  }

  const change = await prisma.billingPlanChange.findFirst({
    where: {
      id: billing.activePlanChangeId,
      organizationBillingId: billing.id,
    },
  });

  if (
    !change ||
    change.stripeCustomerId !== prepared.stripeCustomerId ||
    change.stripeSubscriptionId !==
      prepared.snapshot.stripeSubscriptionId ||
    (
      change.status !== "PROCESSING" &&
      change.status !== "PENDING_PAYMENT" &&
      change.status !== "RECONCILIATION_REQUIRED"
    )
  ) {
    throw retryRequired();
  }

  readBillingPlanChangeUpdateParameters(change);

  const stripe = getStripeClient();

  const subscription = await stripe.subscriptions.retrieve(
    change.stripeSubscriptionId,
  );

  if (subscription.id !== change.stripeSubscriptionId) {
    throw retryRequired();
  }

  const snapshot = mapBillingSubscription(
    subscription,
    prepared.organizationId,
    prepared.stripeCustomerId,
    env.STRIPE_MODE === "live",
  );

  // Prevent combining reads from different subscription states.
  if (
    JSON.stringify(snapshot) !==
    JSON.stringify(prepared.snapshot)
  ) {
    throw retryRequired();
  }

  let correlatedInvoiceId = change.stripeInvoiceId;

  // Recover the invoice mapping after an interrupted response,
  // using only this operation's verified event correlation.
  if (!correlatedInvoiceId) {
    const request: unknown = event.request;
    const object: unknown = event.data.object;

    const expectedKey =
      `motodesk:${env.STRIPE_MODE}:plan-change:${change.id}`;

    if (
      isRecord(request) &&
      request.idempotency_key === expectedKey &&
      isRecord(object) &&
      object.object === "subscription" &&
      object.id === change.stripeSubscriptionId
    ) {
      const eventInvoiceId = readId(object.latest_invoice);
      const currentInvoiceId = readId(subscription.latest_invoice);

      if (
        eventInvoiceId &&
        eventInvoiceId === currentInvoiceId
      ) {
        correlatedInvoiceId = eventInvoiceId;
      }
    }
  }

  const base = {
    organizationId: prepared.organizationId,
    stripeCustomerId: prepared.stripeCustomerId,
    stripeSubscriptionId: change.stripeSubscriptionId,
    changeId: change.id,
    stripeInvoiceId: correlatedInvoiceId,
  };

  if (
    !subscription.pending_update &&
    matchesTarget(change, snapshot)
  ) {
    return {
      ...base,
      outcome: "APPLIED",
    };
  }

  const sourceMatches = matchesSource(change, snapshot);

  if (subscription.pending_update) {
    if (!sourceMatches) {
      return {
        ...base,
        outcome: "RECONCILIATION_REQUIRED",
      };
    }

    if (
      correlatedInvoiceId &&
      readId(subscription.latest_invoice) === correlatedInvoiceId
    ) {
      return {
        ...base,
        outcome: "PENDING_PAYMENT",
      };
    }

    // Never attribute an unidentified pending update to this claim.
    return null;
  }

  if (sourceMatches && correlatedInvoiceId) {
    const invoice = await stripe.invoices.retrieve(
      correlatedInvoiceId,
    );

    if (
      invoice.id !== correlatedInvoiceId ||
      readId(invoice.customer) !== prepared.stripeCustomerId ||
      invoice.livemode !== (env.STRIPE_MODE === "live")
    ) {
      throw retryRequired();
    }

    if (invoice.status === "void") {
      return {
        ...base,
        outcome: "EXPIRED",
      };
    }
  }

  if (!sourceMatches) {
    return {
      ...base,
      outcome: "RECONCILIATION_REQUIRED",
    };
  }

  return null;
}

//************************************************************** */

// Call after applying the prepared subscription synchronization,
// inside the same webhook completion transaction.
//
// This function does not apply subscription synchronization again.
export async function applyBillingPlanChangeReconciliation(
  transaction: Prisma.TransactionClient,
  prepared: PreparedBillingSynchronization,
  reconciliation: PreparedPlanChangeReconciliation | null,
): Promise<void> {
  if (!reconciliation) {
    return;
  }

  await lockOrganizationUserCapacity(
    transaction,
    prepared.organizationId,
  );

  if (
    reconciliation.organizationId !== prepared.organizationId ||
    reconciliation.stripeCustomerId !== prepared.stripeCustomerId ||
    reconciliation.stripeSubscriptionId !==
      prepared.snapshot.stripeSubscriptionId
  ) {
    throw retryRequired();
  }

  const billing = await transaction.organizationBilling.findUnique({
    where: {
      organizationId: prepared.organizationId,
    },
  });

  if (
    !billing ||
    billing.activePlanChangeId !== reconciliation.changeId
  ) {
    // Another request may have resolved this operation.
    // Never overwrite or clear another operation's claim.
    return;
  }

  if (
    billing.activeUserCapacityChangeId ||
    billing.stripeCustomerId !== reconciliation.stripeCustomerId ||
    billing.stripeSubscriptionId !== reconciliation.stripeSubscriptionId ||
    billing.planId !== prepared.snapshot.planId ||
    billing.stripePriceId !== prepared.snapshot.stripePriceId ||
    billing.additionalUserQuantity !==
      prepared.snapshot.additionalUserQuantity
  ) {
    throw retryRequired();
  }

  const change = await transaction.billingPlanChange.findFirst({
    where: {
      id: reconciliation.changeId,
      organizationBillingId: billing.id,
    },
  });

  if (
    !change ||
    change.stripeCustomerId !== reconciliation.stripeCustomerId ||
    change.stripeSubscriptionId !== reconciliation.stripeSubscriptionId ||
    (
      change.status !== "PROCESSING" &&
      change.status !== "PENDING_PAYMENT" &&
      change.status !== "RECONCILIATION_REQUIRED"
    ) ||
    (
      change.stripeInvoiceId !== null &&
      reconciliation.stripeInvoiceId !== null &&
      change.stripeInvoiceId !== reconciliation.stripeInvoiceId
    )
  ) {
    throw retryRequired();
  }

  if (
    reconciliation.outcome === "APPLIED" &&
    !matchesTarget(change, prepared.snapshot)
  ) {
    throw retryRequired();
  }

  if (
    (
      reconciliation.outcome === "PENDING_PAYMENT" ||
      reconciliation.outcome === "EXPIRED"
    ) &&
    (
      !reconciliation.stripeInvoiceId ||
      !matchesSource(change, prepared.snapshot)
    )
  ) {
    throw retryRequired();
  }

  await transaction.billingPlanChange.update({
    where: {
      id: change.id,
    },

    data: {
      status: reconciliation.outcome,

      ...(reconciliation.stripeInvoiceId !== null
        ? {
            stripeInvoiceId: reconciliation.stripeInvoiceId,
          }
        : {}),

      ...(reconciliation.outcome === "APPLIED"
        ? {
            appliedAt: new Date(),
          }
        : {}),

      lastErrorCode:
        reconciliation.outcome === "RECONCILIATION_REQUIRED"
          ? "BILLING_PLAN_RECONCILIATION_REQUIRED"
          : null,
    },
  });

  if (
    reconciliation.outcome === "APPLIED" ||
    reconciliation.outcome === "EXPIRED"
  ) {
    await transaction.organizationBilling.update({
      where: {
        id: billing.id,
      },

      data: {
        activePlanChangeId: null,
      },
    });
  }
}

//************************************************************** */