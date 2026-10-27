import Stripe from "stripe";

import { env } from "../../config/env.js";
import { getStripeClient } from "../../config/stripe.js";

import type {
  BillingUserCapacityChange,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  Permissions,
} from "../permissions/permission.constants.js";

import {
  assertOrganizationBillingAccess,
  isOrganizationBillingExempt,
} from "./billing-access.service.js";

import {
  resolveBillingAdditionalUserPrice,
} from "./billing-price.service.js";

import {
  mapBillingSubscription,
} from "./billing-subscription.mapper.js";

import {
  prepareBillingSynchronization,
} from "./billing-sync.service.js";

import {
  claimBillingUserCapacityChange,
  findBillingUserCapacityChange,
} from "./billing-user-capacity.repository.js";

import {
  applyConfirmedBillingUserCapacityChange,
  recordPendingBillingUserCapacityChange,
  recordRejectedBillingUserCapacityChange,
  recordUnconfirmedBillingUserCapacityChange,
} from "./billing-user-capacity-outcome.repository.js";

import {
  assertBillingUserCapacityUpdateMatchesSubscription,
  readBillingUserCapacityUpdateParameters,
} from "./billing-user-capacity-parameters.js";

import type {
  ConfirmBillingUserCapacityChangeInput,
} from "./billing.schemas.js";

//************************************************************** */

export interface BillingUserCapacityConfirmationResult {
  changeId: string;
  status: "APPLIED" | "PENDING_PAYMENT";
  currency: string;
  targetAdditionalUserQuantity: number;
  targetUserLimit: number;
  monthlyTotalAmount: number;
}

//************************************************************** */

function reconciliationRequired(): AppError {
  return new AppError(
    409,
    "This user-capacity change requires reconciliation. Refresh billing before continuing.",
    {
      code: "BILLING_CAPACITY_RECONCILIATION_REQUIRED",
    },
  );
}

function unconfirmedChange(): AppError {
  return new AppError(
    503,
    "The user-capacity change could not be confirmed. Refresh billing before trying again.",
    {
      code: "BILLING_CAPACITY_CHANGE_UNCONFIRMED",
    },
  );
}

function invoiceId(
  subscription: Stripe.Subscription,
): string | null {
  return typeof subscription.latest_invoice === "string"
    ? subscription.latest_invoice
    : subscription.latest_invoice?.id ?? null;
}

function publicResult(
  change: BillingUserCapacityChange,
): BillingUserCapacityConfirmationResult {
  if (
    change.status !== "APPLIED" &&
    change.status !== "PENDING_PAYMENT"
  ) {
    throw reconciliationRequired();
  }

  const monthlyTotalAmount = Number(change.monthlyTotalAmount);

  if (!Number.isSafeInteger(monthlyTotalAmount)) {
    throw reconciliationRequired();
  }

  return {
    changeId: change.id,
    status: change.status,
    currency: change.currency,
    targetAdditionalUserQuantity:
      change.targetAdditionalUserQuantity,
    targetUserLimit: 10 + change.targetAdditionalUserQuantity,
    monthlyTotalAmount,
  };
}

//************************************************************** */

async function applyVerifiedChange(
  organizationId: string,
  change: BillingUserCapacityChange,
): Promise<BillingUserCapacityConfirmationResult> {
  const prepared = await prepareBillingSynchronization(
    change.stripeCustomerId,
  );

  if (!prepared) {
    throw reconciliationRequired();
  }

  const applied = await applyConfirmedBillingUserCapacityChange(
    organizationId,
    change.id,
    prepared,
  );

  return publicResult(applied);
}

//************************************************************** */

export async function confirmOrganizationBillingUserCapacity(
  organizationId: string,
  userId: string,
  input: ConfirmBillingUserCapacityChangeInput,
): Promise<BillingUserCapacityConfirmationResult> {
  await assertOrganizationBillingAccess(
    organizationId,
    userId,
    Permissions.BILLING_UPDATE,
  );

  if (await isOrganizationBillingExempt(organizationId)) {
    throw new AppError(
      409,
      "This organization does not need to purchase additional users.",
      {
        code: "BILLING_EXEMPT",
      },
    );
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(
      503,
      "Billing is currently unavailable.",
      {
        code: "BILLING_WEBHOOK_NOT_CONFIGURED",
      },
    );
  }

  const change = await findBillingUserCapacityChange(
    organizationId,
    userId,
    input.changeId,
  );

  if (!change) {
    throw new AppError(
      404,
      "User-capacity change not found.",
      {
        code: "BILLING_CAPACITY_CHANGE_NOT_FOUND",
      },
    );
  }

  if (change.status === "APPLIED") {
    return publicResult(change);
  }

  if (
    change.status !== "QUOTED" &&
    change.status !== "PROCESSING" &&
    change.status !== "PENDING_PAYMENT"
  ) {
    throw reconciliationRequired();
  }

  const parameters =
    readBillingUserCapacityUpdateParameters(change);

  const stripe = getStripeClient();

  try {
    const customer = await stripe.customers.retrieve(
      change.stripeCustomerId,
    );

    if (
      customer.deleted ||
      customer.livemode !== (env.STRIPE_MODE === "live") ||
      customer.metadata.organizationId !== organizationId
    ) {
      throw new AppError(
        409,
        "The organization billing account requires review.",
        {
          code: "BILLING_CUSTOMER_MAPPING_INVALID",
        },
      );
    }

    const current = await stripe.subscriptions.retrieve(
      change.stripeSubscriptionId,
    );

    if (current.id !== change.stripeSubscriptionId) {
      throw reconciliationRequired();
    }

    const currentSnapshot = mapBillingSubscription(
      current,
      organizationId,
      customer.id,
      env.STRIPE_MODE === "live",
    );

    // Reconcile an earlier submission before considering a retry.
    if (change.status !== "QUOTED") {
      if (
        !current.pending_update &&
        currentSnapshot.additionalUserQuantity ===
          change.targetAdditionalUserQuantity
      ) {
        return await applyVerifiedChange(
          organizationId,
          change,
        );
      }

      if (current.pending_update) {
        const currentInvoiceId = invoiceId(current);

        if (
          !currentInvoiceId ||
          change.stripeInvoiceId !== currentInvoiceId ||
          currentSnapshot.additionalUserQuantity !==
            change.expectedAdditionalUserQuantity
        ) {
          // Do not overwrite an unidentified pending update.
          throw reconciliationRequired();
        }

        const pending =
          await recordPendingBillingUserCapacityChange(
            organizationId,
            change.id,
            currentInvoiceId,
          );

        return publicResult(pending);
      }

      if (change.status === "PENDING_PAYMENT") {
        // A pending update may have expired or been canceled.
        // Its outcome must be reconciled before releasing its claim.
        throw reconciliationRequired();
      }
    }

    assertBillingUserCapacityUpdateMatchesSubscription(
      organizationId,
      change,
      parameters,
      current,
    );

    // For a newly added item, ensure the preview's price is still
    // the configured active additional-user price.
    if (change.expectedAdditionalUserQuantity === 0) {
      const price = await resolveBillingAdditionalUserPrice("pro");

      if (parameters.items?.[0]?.price !== price.stripePriceId) {
        throw new AppError(
          409,
          "Pricing changed after this preview. Request a new preview.",
          {
            code: "BILLING_CAPACITY_STATE_CHANGED",
          },
        );
      }
    }

    const claimed = await claimBillingUserCapacityChange(
      organizationId,
      userId,
      change.id,
    );

    if (claimed.outcome !== "submit") {
      return publicResult(claimed.change);
    }

    let response: Stripe.Subscription;

    // Only errors from the actual update request can establish
    // that Stripe rejected this submission.
    try {
      response = await stripe.subscriptions.update(
        change.stripeSubscriptionId,
        parameters,
        {
          idempotencyKey:
            `motodesk:${env.STRIPE_MODE}:user-capacity:${change.id}`,
        },
      );
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.statusCode === 400
      ) {
        const rejected =
          await recordRejectedBillingUserCapacityChange(
            organizationId,
            change.id,
          );

        if (
          rejected.status === "APPLIED" ||
          rejected.status === "PENDING_PAYMENT"
        ) {
          return publicResult(rejected);
        }

        throw new AppError(
          503,
          "The billing provider rejected this change. Request a new preview after resolving the billing configuration.",
          {
            code: "BILLING_CAPACITY_CHANGE_REJECTED",
          },
        );
      }

      try {
        const recorded =
          await recordUnconfirmedBillingUserCapacityChange(
            organizationId,
            change.id,
          );

        if (
          recorded.status === "APPLIED" ||
          recorded.status === "PENDING_PAYMENT"
        ) {
          return publicResult(recorded);
        }
      } catch {
        // Preserve the operation claim even if recording the
        // diagnostic code fails.
      }

      throw unconfirmedChange();
    }

    if (response.id !== change.stripeSubscriptionId) {
      throw reconciliationRequired();
    }

    mapBillingSubscription(
      response,
      organizationId,
      customer.id,
      env.STRIPE_MODE === "live",
    );

    // A retried Stripe request can return a cached response.
    // Read the current subscription before applying its outcome.
    const verified = await stripe.subscriptions.retrieve(
      change.stripeSubscriptionId,
    );

    if (verified.id !== change.stripeSubscriptionId) {
      throw reconciliationRequired();
    }

    const verifiedSnapshot = mapBillingSubscription(
      verified,
      organizationId,
      customer.id,
      env.STRIPE_MODE === "live",
    );

    if (
      !verified.pending_update &&
      verifiedSnapshot.additionalUserQuantity ===
        change.targetAdditionalUserQuantity
    ) {
      return await applyVerifiedChange(
        organizationId,
        claimed.change,
      );
    }

    const verifiedInvoiceId = invoiceId(verified);

    if (
      response.pending_update &&
      verified.pending_update &&
      verifiedInvoiceId &&
      invoiceId(response) === verifiedInvoiceId &&
      verifiedSnapshot.additionalUserQuantity ===
        change.expectedAdditionalUserQuantity
    ) {
      const pending =
        await recordPendingBillingUserCapacityChange(
          organizationId,
          change.id,
          verifiedInvoiceId,
        );

      return publicResult(pending);
    }

    throw reconciliationRequired();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    // Never expose SDK messages, request payloads, or credentials.
    throw unconfirmedChange();
  }
}

//************************************************************** */