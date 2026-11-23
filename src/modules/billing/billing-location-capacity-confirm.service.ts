
import Stripe from "stripe";

import { env } from "../../config/env.js";
import { getStripeClient } from "../../config/stripe.js";

import type {
  BillingLocationCapacityChange,
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
  resolveBillingAdditionalLocationPrice,
} from "./billing-price.service.js";

import {
  mapBillingSubscription,
} from "./billing-subscription.mapper.js";

import {
  prepareBillingSynchronization,
} from "./billing-sync.service.js";

import {
  claimBillingLocationCapacityChange,
  findBillingLocationCapacityChange,
} from "./billing-location-capacity.repository.js";

import {
  applyConfirmedBillingLocationCapacityChange,
  recordPendingBillingLocationCapacityChange,
  recordRejectedBillingLocationCapacityChange,
  recordUnconfirmedBillingLocationCapacityChange,
} from "./billing-location-capacity-outcome.repository.js";

import {
  assertBillingLocationCapacityUpdateMatchesSubscription,
  readBillingLocationCapacityUpdateParameters,
} from "./billing-location-capacity-parameters.js";

//************************************************************** */

export interface ConfirmBillingLocationCapacityChangeInput {
  changeId: string;
}

export interface BillingLocationCapacityConfirmationResult {
  changeId: string;
  status: "APPLIED" | "PENDING_PAYMENT";
  currency: string;
  targetAdditionalLocationQuantity: number;
  targetLocationLimit: number;
  monthlyTotalAmount: number;
}

//************************************************************** */

function reconciliationRequired(): AppError {
  return new AppError(
    409,
    "This location-capacity change requires reconciliation. Refresh billing before continuing.",
    {
      code: "BILLING_LOCATION_RECONCILIATION_REQUIRED",
    },
  );
}

function unconfirmedChange(): AppError {
  return new AppError(
    503,
    "The location-capacity change could not be confirmed. Refresh billing before trying again.",
    {
      code: "BILLING_LOCATION_CHANGE_UNCONFIRMED",
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
  change: BillingLocationCapacityChange,
): BillingLocationCapacityConfirmationResult {
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
    targetAdditionalLocationQuantity:
      change.targetAdditionalLocationQuantity,
    targetLocationLimit:
      2 + change.targetAdditionalLocationQuantity,
    monthlyTotalAmount,
  };
}

//************************************************************** */

async function applyVerifiedChange(
  organizationId: string,
  change: BillingLocationCapacityChange,
): Promise<BillingLocationCapacityConfirmationResult> {
  const prepared = await prepareBillingSynchronization(
    change.stripeCustomerId,
  );

  if (!prepared) {
    throw reconciliationRequired();
  }

  const applied =
    await applyConfirmedBillingLocationCapacityChange(
      organizationId,
      change.id,
      prepared,
    );

  return publicResult(applied);
}

//************************************************************** */

export async function confirmOrganizationBillingLocationCapacity(
  organizationId: string,
  userId: string,
  input: ConfirmBillingLocationCapacityChangeInput,
): Promise<BillingLocationCapacityConfirmationResult> {
  await assertOrganizationBillingAccess(
    organizationId,
    userId,
    Permissions.BILLING_UPDATE,
  );

  if (await isOrganizationBillingExempt(organizationId)) {
    throw new AppError(
      409,
      "This organization does not need to purchase additional locations.",
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

  const change = await findBillingLocationCapacityChange(
    organizationId,
    userId,
    input.changeId,
  );

  if (!change) {
    throw new AppError(
      404,
      "Location-capacity change not found.",
      {
        code: "BILLING_LOCATION_CHANGE_NOT_FOUND",
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
    readBillingLocationCapacityUpdateParameters(change);

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

    // Reconcile an earlier submission before retrying.
    if (change.status !== "QUOTED") {
      if (
        !current.pending_update &&
        currentSnapshot.additionalLocationQuantity ===
          change.targetAdditionalLocationQuantity
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
          currentSnapshot.additionalLocationQuantity !==
            change.expectedAdditionalLocationQuantity
        ) {
          throw reconciliationRequired();
        }

        const pending =
          await recordPendingBillingLocationCapacityChange(
            organizationId,
            change.id,
            currentInvoiceId,
          );

        return publicResult(pending);
      }

      if (change.status === "PENDING_PAYMENT") {
        throw reconciliationRequired();
      }
    }

    assertBillingLocationCapacityUpdateMatchesSubscription(
      organizationId,
      change,
      parameters,
      current,
    );

    // Verify the configured price when adding a new item.
    if (change.expectedAdditionalLocationQuantity === 0) {
      const price =
        await resolveBillingAdditionalLocationPrice("pro");

      if (parameters.items?.[0]?.price !== price.stripePriceId) {
        throw new AppError(
          409,
          "Pricing changed after this preview. Request a new preview.",
          {
            code: "BILLING_LOCATION_STATE_CHANGED",
          },
        );
      }
    }

    const claimed = await claimBillingLocationCapacityChange(
      organizationId,
      userId,
      change.id,
    );

    if (claimed.outcome !== "submit") {
      return publicResult(claimed.change);
    }

    let response: Stripe.Subscription;

    try {
      response = await stripe.subscriptions.update(
        change.stripeSubscriptionId,
        parameters,
        {
          idempotencyKey:
            `motodesk:${env.STRIPE_MODE}:location-capacity:${change.id}`,
        },
      );
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.statusCode === 400
      ) {
        const rejected =
          await recordRejectedBillingLocationCapacityChange(
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
            code: "BILLING_LOCATION_CHANGE_REJECTED",
          },
        );
      }

      try {
        const recorded =
          await recordUnconfirmedBillingLocationCapacityChange(
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
        // Preserve the claim if diagnostic recording fails.
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

    // Re-read Stripe; idempotent retries can return cached data.
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
      verifiedSnapshot.additionalLocationQuantity ===
        change.targetAdditionalLocationQuantity
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
      verifiedSnapshot.additionalLocationQuantity ===
        change.expectedAdditionalLocationQuantity
    ) {
      const pending =
        await recordPendingBillingLocationCapacityChange(
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

    throw unconfirmedChange();
  }
}
