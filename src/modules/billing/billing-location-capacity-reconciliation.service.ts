
import type Stripe from "stripe";

import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { getStripeClient } from "../../config/stripe.js";

import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../platform/errors/app-error.js";

import {
  lockOrganizationUserCapacity,
} from "./billing-capacity.service.js";

import {
  mapBillingSubscription,
} from "./billing-subscription.mapper.js";

import type {
  PreparedBillingSynchronization,
} from "./billing-sync.service.js";

export interface PreparedLocationCapacityReconciliation {
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  changeId: string;
  targetAdditionalLocationQuantity: number;
  outcome:
    | "APPLIED"
    | "PENDING_PAYMENT"
    | "EXPIRED"
    | "RECONCILIATION_REQUIRED";
  stripeInvoiceId: string | null;
}

function retryRequired(): AppError {
  return new AppError(
    503,
    "Location billing reconciliation must be retried.",
    {
      code: "BILLING_LOCATION_RECONCILIATION_RETRY_REQUIRED",
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

// Only call for a signature-verified Stripe event.
// Stripe requests occur outside database transactions.
export async function prepareBillingLocationCapacityReconciliation(
  event: Stripe.Event,
  prepared: PreparedBillingSynchronization,
): Promise<PreparedLocationCapacityReconciliation | null> {
  if (
    event.livemode !== (env.STRIPE_MODE === "live") ||
    event.account
  ) {
    throw retryRequired();
  }

  const billing = await prisma.organizationBilling.findUnique({
    where: { organizationId: prepared.organizationId },
  });

  if (!billing?.activeLocationCapacityChangeId) {
    return null;
  }

  const change = await prisma.billingLocationCapacityChange.findFirst({
    where: {
      id: billing.activeLocationCapacityChangeId,
      organizationBillingId: billing.id,
    },
  });

  if (
    !change ||
    change.stripeCustomerId !== prepared.stripeCustomerId ||
    change.stripeSubscriptionId !==
      prepared.snapshot.stripeSubscriptionId ||
    ![
      "PROCESSING",
      "PENDING_PAYMENT",
      "RECONCILIATION_REQUIRED",
    ].includes(change.status)
  ) {
    throw retryRequired();
  }

  const stripe = getStripeClient();

  const subscription = await stripe.subscriptions.retrieve(
    change.stripeSubscriptionId,
  );

  const snapshot = mapBillingSubscription(
    subscription,
    prepared.organizationId,
    prepared.stripeCustomerId,
    env.STRIPE_MODE === "live",
  );

  if (
    subscription.id !== change.stripeSubscriptionId ||
    JSON.stringify(snapshot) !==
      JSON.stringify(prepared.snapshot)
  ) {
    throw retryRequired();
  }

  let correlatedInvoiceId = change.stripeInvoiceId;

  if (!correlatedInvoiceId) {
    const request: unknown = event.request;
    const object: unknown = event.data.object;

    const expectedKey =
      `motodesk:${env.STRIPE_MODE}:location-capacity:${change.id}`;

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
    targetAdditionalLocationQuantity:
      change.targetAdditionalLocationQuantity,
    stripeInvoiceId: correlatedInvoiceId,
  };

  if (
    !subscription.pending_update &&
    snapshot.additionalLocationQuantity ===
      change.targetAdditionalLocationQuantity &&
    snapshot.planId === "pro" &&
    (
      snapshot.status === "ACTIVE" ||
      snapshot.status === "TRIALING"
    )
  ) {
    if (
      !correlatedInvoiceId ||
      readId(subscription.latest_invoice) !== correlatedInvoiceId
    ) {
      throw retryRequired();
    }

    const invoice = await stripe.invoices.retrieve(
  correlatedInvoiceId,
);

if (
  invoice.id !== correlatedInvoiceId ||
  readId(invoice.customer) !== prepared.stripeCustomerId ||
  readId(invoice.parent?.subscription_details?.subscription) !==
  change.stripeSubscriptionId ||
  invoice.livemode !== (env.STRIPE_MODE === "live") ||
  invoice.status !== "paid"
) {
  throw retryRequired();
}

    return { ...base, outcome: "APPLIED" };
  }

  if (subscription.pending_update) {
    if (
      correlatedInvoiceId &&
      readId(subscription.latest_invoice) ===
        correlatedInvoiceId &&
      snapshot.additionalLocationQuantity ===
        change.expectedAdditionalLocationQuantity
    ) {
      return { ...base, outcome: "PENDING_PAYMENT" };
    }

    return null;
  }

  if (
    snapshot.additionalLocationQuantity ===
      change.expectedAdditionalLocationQuantity &&
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

    if (invoice.status === "void") {
      return { ...base, outcome: "EXPIRED" };
    }
  }

  if (
    snapshot.additionalLocationQuantity !==
      change.expectedAdditionalLocationQuantity
  ) {
    return {
      ...base,
      outcome: "RECONCILIATION_REQUIRED",
    };
  }

  return null;
}

// Called inside the existing webhook completion transaction.
export async function applyBillingLocationCapacityReconciliation(
  transaction: Prisma.TransactionClient,
  prepared: PreparedBillingSynchronization,
  reconciliation: PreparedLocationCapacityReconciliation | null,
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
    where: { organizationId: prepared.organizationId },
  });

  if (
    !billing ||
    billing.activeLocationCapacityChangeId !==
      reconciliation.changeId
  ) {
    return;
  }

  const change = await transaction.billingLocationCapacityChange.findFirst({
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
    change.targetAdditionalLocationQuantity !==
      reconciliation.targetAdditionalLocationQuantity ||
    ![
      "PROCESSING",
      "PENDING_PAYMENT",
      "RECONCILIATION_REQUIRED",
    ].includes(change.status) ||
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
    billing.additionalLocationQuantity !==
      change.targetAdditionalLocationQuantity
  ) {
    throw retryRequired();
  }

  await transaction.billingLocationCapacityChange.update({
    where: { id: change.id },
    data: {
      status: reconciliation.outcome,

      ...(reconciliation.stripeInvoiceId
        ? { stripeInvoiceId: reconciliation.stripeInvoiceId }
        : {}),

      ...(reconciliation.outcome === "APPLIED"
        ? { appliedAt: new Date() }
        : {}),

      lastErrorCode:
        reconciliation.outcome === "RECONCILIATION_REQUIRED"
          ? "BILLING_LOCATION_RECONCILIATION_REQUIRED"
          : null,
    },
  });

  if (
    reconciliation.outcome === "APPLIED" ||
    reconciliation.outcome === "EXPIRED"
  ) {
    await transaction.organizationBilling.update({
      where: { id: billing.id },
      data: {
        activeLocationCapacityChangeId: null,
      },
    });
  }
}
