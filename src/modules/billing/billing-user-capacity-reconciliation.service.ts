import type Stripe from "stripe";

import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { getStripeClient } from "../../config/stripe.js";

import type {
  Prisma,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  lockOrganizationUserCapacity,
} from "./billing-capacity.service.js";

import {
  mapBillingSubscription,
} from "./billing-subscription.mapper.js";

import {
  applyBillingSynchronization,
  type PreparedBillingSynchronization,
} from "./billing-sync.service.js";

//************************************************************** */

export interface PreparedUserCapacityReconciliation {
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;

  changeId: string;
  targetAdditionalUserQuantity: number;

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
    "Billing reconciliation must be retried.",
    {
      code: "BILLING_CAPACITY_RECONCILIATION_RETRY_REQUIRED",
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

//************************************************************** */

// Only call with an event that passed signature verification.
// All Stripe reads happen before the database transaction.
export async function prepareBillingUserCapacityReconciliation(
  event: Stripe.Event,
  prepared: PreparedBillingSynchronization,
): Promise<PreparedUserCapacityReconciliation | null> {
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

  if (!billing?.activeUserCapacityChangeId) {
    return null;
  }

  const change = await prisma.billingUserCapacityChange.findFirst({
    where: {
      id: billing.activeUserCapacityChangeId,
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

  // The subscription may have changed between the original
  // synchronization read and this reconciliation read.
  if (
    JSON.stringify(snapshot) !==
    JSON.stringify(prepared.snapshot)
  ) {
    throw retryRequired();
  }

  let correlatedInvoiceId = change.stripeInvoiceId;

  // Recover an invoice mapping after an interrupted update response.
  // Correlate only the exact operation's Stripe idempotency key and
  // the same subscription/invoice pair from the verified event.
  if (!correlatedInvoiceId) {
    const request: unknown = event.request;
    const object: unknown = event.data.object;

    const expectedKey =
      `motodesk:${env.STRIPE_MODE}:user-capacity:${change.id}`;

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
    targetAdditionalUserQuantity:
      change.targetAdditionalUserQuantity,

    stripeInvoiceId: correlatedInvoiceId,
  };

  if (
    !subscription.pending_update &&
    snapshot.additionalUserQuantity ===
      change.targetAdditionalUserQuantity &&
    snapshot.planId === "pro" &&
    (
      snapshot.status === "ACTIVE" ||
      snapshot.status === "TRIALING"
    )
  ) {
    return {
      ...base,
      outcome: "APPLIED",
    };
  }

  if (subscription.pending_update) {
    if (
      correlatedInvoiceId &&
      readId(subscription.latest_invoice) ===
        correlatedInvoiceId &&
      snapshot.additionalUserQuantity ===
        change.expectedAdditionalUserQuantity
    ) {
      return {
        ...base,
        outcome: "PENDING_PAYMENT",
      };
    }

    // Never attribute an unidentified pending update to this
    // operation or overwrite it by submitting another request.
    return null;
  }

  if (
    snapshot.additionalUserQuantity ===
      change.expectedAdditionalUserQuantity &&
    correlatedInvoiceId
  ) {
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

    // Release only after Stripe confirms the related invoice
    // cannot be paid and the requested quantity was not applied.
    if (invoice.status === "void") {
      return {
        ...base,
        outcome: "EXPIRED",
      };
    }
  }

  if (
    snapshot.additionalUserQuantity !==
      change.expectedAdditionalUserQuantity
  ) {
    return {
      ...base,
      outcome: "RECONCILIATION_REQUIRED",
    };
  }

  return null;
}

//************************************************************** */

// Called inside the webhook completion transaction.
//
// Lock order matches membership/invitation writes. Subscription
// state, operation outcome, and webhook completion commit together.
export async function applyBillingUserCapacityReconciliation(
  transaction: Prisma.TransactionClient,
  prepared: PreparedBillingSynchronization,
  reconciliation: PreparedUserCapacityReconciliation | null,
): Promise<void> {
  await lockOrganizationUserCapacity(
    transaction,
    prepared.organizationId,
  );

  await applyBillingSynchronization(
    transaction,
    prepared,
  );

  if (!reconciliation) {
    return;
  }

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
    billing.activeUserCapacityChangeId !==
      reconciliation.changeId
  ) {
    // Another request may already have resolved this operation.
    // Never clear or update a different operation's claim.
    return;
  }

  const change = await transaction.billingUserCapacityChange.findFirst({
    where: {
      id: reconciliation.changeId,
      organizationBillingId: billing.id,
    },
  });

  if (
    !change ||
    change.stripeCustomerId !== reconciliation.stripeCustomerId ||
    change.stripeSubscriptionId !==
      reconciliation.stripeSubscriptionId ||
    change.targetAdditionalUserQuantity !==
      reconciliation.targetAdditionalUserQuantity ||
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
    billing.additionalUserQuantity !==
      change.targetAdditionalUserQuantity
  ) {
    throw retryRequired();
  }

  await transaction.billingUserCapacityChange.update({
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
          ? "BILLING_CAPACITY_RECONCILIATION_REQUIRED"
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
        activeUserCapacityChangeId: null,
      },
    });
  }
}

//************************************************************** */