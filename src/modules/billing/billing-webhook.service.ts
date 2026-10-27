import type Stripe from "stripe";

import { env } from "../../config/env.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  claimBillingWebhookEvent,
  completeBillingWebhookEvent,
  releaseFailedBillingWebhookEvent,
} from "./billing-webhook.repository.js";

import {
  prepareBillingSynchronization,
} from "./billing-sync.service.js";

import {
  applyBillingUserCapacityReconciliation,
  prepareBillingUserCapacityReconciliation,
} from "./billing-user-capacity-reconciliation.service.js";

//************************************************************** */

export interface BillingWebhookResult {
  outcome: "processed" | "duplicate" | "ignored";
}

//************************************************************** */

function isSupportedEvent(type: string): boolean {
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.expired":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.pending_update_applied":
    case "customer.subscription.pending_update_expired":
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.voided":
      return true;

    default:
      return false;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCustomerId(
  object: Record<string, unknown>,
): string | null {
  const customer = object.customer;

  if (
    typeof customer === "string" &&
    customer.length > 0
  ) {
    return customer;
  }

  if (
    isRecord(customer) &&
    typeof customer.id === "string" &&
    customer.id.length > 0
  ) {
    return customer.id;
  }

  return null;
}

function retryRequired(): AppError {
  return new AppError(
    503,
    "Webhook processing must be retried.",
    {
      code: "BILLING_WEBHOOK_RETRY_REQUIRED",
    },
  );
}

//************************************************************** */

// Call only after verifyBillingWebhookSignature succeeds.
export async function processBillingWebhookEvent(
  event: Stripe.Event,
): Promise<BillingWebhookResult> {
  if (
    event.livemode !== (env.STRIPE_MODE === "live") ||
    event.account
  ) {
    throw new AppError(
      400,
      "Webhook environment is invalid.",
      {
        code: "BILLING_WEBHOOK_ENVIRONMENT_INVALID",
      },
    );
  }

  if (!isSupportedEvent(event.type)) {
    return {
      outcome: "ignored",
    };
  }

  const object: unknown = event.data.object;

  if (
    !isRecord(object) ||
    typeof object.id !== "string" ||
    object.id.length === 0 ||
    typeof event.id !== "string" ||
    event.id.length === 0 ||
    !Number.isSafeInteger(event.created) ||
    event.created < 0
  ) {
    throw new AppError(
      400,
      "Webhook event is invalid.",
      {
        code: "BILLING_WEBHOOK_EVENT_INVALID",
      },
    );
  }

  const customerId = readCustomerId(object);
  const eventCreatedAt = new Date(event.created * 1_000);

  if (
    !customerId ||
    !Number.isFinite(eventCreatedAt.getTime())
  ) {
    throw new AppError(
      400,
      "Webhook customer or timestamp is invalid.",
      {
        code: "BILLING_WEBHOOK_EVENT_INVALID",
      },
    );
  }

  const claim = await claimBillingWebhookEvent({
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    eventCreatedAt,
    stripeObjectId: object.id,
  });

  if (claim.status === "processed") {
    return {
      outcome: "duplicate",
    };
  }

  if (claim.status === "busy") {
    throw retryRequired();
  }

  try {
    // Fetch Stripe state before entering the database transaction.
    const prepared = await prepareBillingSynchronization(
      customerId,
    );

    const reconciliation = prepared
      ? await prepareBillingUserCapacityReconciliation(
          event,
          prepared,
        )
      : null;

    const completed = await completeBillingWebhookEvent(
      event.id,
      claim.processingToken,
      async (transaction) => {
        if (prepared) {
          // Subscription state, capacity-change outcome, and the
          // webhook completion marker commit atomically.
          await applyBillingUserCapacityReconciliation(
            transaction,
            prepared,
            reconciliation,
          );
        }
      },
    );

    if (!completed) {
      throw retryRequired();
    }

    return {
      outcome: prepared ? "processed" : "ignored",
    };
  } catch (error) {
    try {
      await releaseFailedBillingWebhookEvent(
        event.id,
        claim.processingToken,
      );
    } catch {
      // If release fails, the processing lease can expire.
      // Never acknowledge an event whose processing failed.
    }

    if (error instanceof AppError) {
      throw error;
    }

    // Avoid exposing raw Stripe or database error details.
    throw retryRequired();
  }
}

//************************************************************** */