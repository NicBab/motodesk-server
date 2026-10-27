import Stripe from "stripe";

import { env } from "../../config/env.js";
import { getStripeClient } from "../../config/stripe.js";

import type {
  BillingPlanChange,
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
  getBillingPlan,
  isBillingPlanId,
  type BillingPlanId,
} from "./billing.constants.js";

import {
  resolveBillingPrice,
  resolveBillingAdditionalUserPrice,
} from "./billing-price.service.js";

import {
  mapBillingSubscription,
  type BillingSubscriptionSnapshot,
} from "./billing-subscription.mapper.js";

import {
  prepareBillingSynchronization,
} from "./billing-sync.service.js";

import {
  claimBillingPlanChange,
  findBillingPlanChange,
} from "./billing-plan-change.repository.js";

import {
  applyConfirmedBillingPlanChange,
  recordPendingBillingPlanChange,
  recordRejectedBillingPlanChange,
  recordUnconfirmedBillingPlanChange,
} from "./billing-plan-change-outcome.repository.js";

import {
  assertBillingPlanChangeUpdateMatchesSubscription,
  readBillingPlanChangeUpdateParameters,
} from "./billing-plan-change-parameters.js";

import type {
  ConfirmBillingPlanChangeInput,
} from "./billing-plan-change.schemas.js";

//************************************************************** */

export interface BillingPlanChangeConfirmationResult {
  changeId: string;
  status: "APPLIED" | "PENDING_PAYMENT";
  currency: string;
  targetPlanId: BillingPlanId;
  targetAdditionalUserQuantity: number;
  targetUserLimit: number;
  monthlyTotalAmount: number;
}

//************************************************************** */

function reconciliationRequired(): AppError {
  return new AppError(
    409,
    "This plan change requires reconciliation. Refresh billing before continuing.",
    {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    },
  );
}

function unconfirmedChange(): AppError {
  return new AppError(
    503,
    "The plan change could not be confirmed. Check this change again before starting another.",
    {
      code: "BILLING_PLAN_CHANGE_UNCONFIRMED",
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
  parameters: Stripe.SubscriptionUpdateParams,
  snapshot: BillingSubscriptionSnapshot,
): boolean {
  if (
    snapshot.planId !== change.targetPlanId ||
    snapshot.stripePriceId !== parameters.items?.[0]?.price ||
    snapshot.additionalUserQuantity !==
      change.targetAdditionalUserQuantity ||
    (
      snapshot.status !== "ACTIVE" &&
      snapshot.status !== "TRIALING"
    )
  ) {
    return false;
  }

  if (change.targetAdditionalUserQuantity > 0) {
    return (
      snapshot.stripeAdditionalUserPriceId ===
        parameters.items?.[1]?.price
    );
  }

  return (
    snapshot.additionalUserUnitAmount === null &&
    snapshot.stripeAdditionalUserPriceId === null &&
    snapshot.stripeAdditionalUserItemId === null
  );
}

function publicResult(
  change: BillingPlanChange,
): BillingPlanChangeConfirmationResult {
  if (
    (
      change.status !== "APPLIED" &&
      change.status !== "PENDING_PAYMENT"
    ) ||
    !isBillingPlanId(change.targetPlanId)
  ) {
    throw reconciliationRequired();
  }

  // Validate stored pricing and quantities before exposing them.
  readBillingPlanChangeUpdateParameters(change);

  const monthlyTotalAmount = Number(change.monthlyTotalAmount);
  const plan = getBillingPlan(change.targetPlanId);

  if (!Number.isSafeInteger(monthlyTotalAmount)) {
    throw reconciliationRequired();
  }

  return {
    changeId: change.id,
    status: change.status,
    currency: change.currency,
    targetPlanId: change.targetPlanId,

    targetAdditionalUserQuantity:
      change.targetAdditionalUserQuantity,

    targetUserLimit:
      plan.usersIncluded + change.targetAdditionalUserQuantity,

    monthlyTotalAmount,
  };
}

//************************************************************** */

async function applyVerifiedChange(
  organizationId: string,
  change: BillingPlanChange,
): Promise<BillingPlanChangeConfirmationResult> {
  const prepared = await prepareBillingSynchronization(
    change.stripeCustomerId,
  );

  if (!prepared) {
    throw reconciliationRequired();
  }

  const applied = await applyConfirmedBillingPlanChange(
    organizationId,
    change.id,
    prepared,
  );

  return publicResult(applied);
}

//************************************************************** */

export async function confirmOrganizationBillingPlanChange(
  organizationId: string,
  userId: string,
  input: ConfirmBillingPlanChangeInput,
): Promise<BillingPlanChangeConfirmationResult> {
  await assertOrganizationBillingAccess(
    organizationId,
    userId,
    Permissions.BILLING_UPDATE,
  );

  if (await isOrganizationBillingExempt(organizationId)) {
    throw new AppError(
      409,
      "This organization is exempt from subscription billing.",
      {
        code: "BILLING_EXEMPT",
      },
    );
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, "Billing is currently unavailable.", {
      code: "BILLING_WEBHOOK_NOT_CONFIGURED",
    });
  }

  const change = await findBillingPlanChange(
    organizationId,
    userId,
    input.changeId,
  );

  if (!change) {
    throw new AppError(404, "Plan change not found.", {
      code: "BILLING_PLAN_CHANGE_NOT_FOUND",
    });
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

  const parameters = readBillingPlanChangeUpdateParameters(change);
  const stripe = getStripeClient();

  try {
    const customer = await stripe.customers.retrieve(
      change.stripeCustomerId,
    );

    if (
      customer.deleted ||
      customer.id !== change.stripeCustomerId ||
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
        matchesTarget(change, parameters, currentSnapshot)
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
          !matchesSource(change, currentSnapshot)
        ) {
          // An unidentified pending update must not be replaced.
          throw reconciliationRequired();
        }

        const pending = await recordPendingBillingPlanChange(
          organizationId,
          change.id,
          currentInvoiceId,
        );

        return publicResult(pending);
      }

      if (change.status === "PENDING_PAYMENT") {
        // Webhook reconciliation will resolve an expired or
        // canceled pending update before its claim is released.
        throw reconciliationRequired();
      }
    }

    assertBillingPlanChangeUpdateMatchesSubscription(
      organizationId,
      change,
      current,
    );

    if (!isBillingPlanId(change.targetPlanId)) {
      throw reconciliationRequired();
    }

    // Confirm that the quoted prices are still the configured
    // active prices. Never silently replace a preview's prices.
    const targetPrice = await resolveBillingPrice(
      change.targetPlanId,
    );

    if (parameters.items?.[0]?.price !== targetPrice.stripePriceId) {
      throw new AppError(
        409,
        "Pricing changed after this preview. Request a new preview.",
        {
          code: "BILLING_PLAN_STATE_CHANGED",
        },
      );
    }

    if (change.targetAdditionalUserQuantity > 0) {
      const additionalPrice = await resolveBillingAdditionalUserPrice(
        change.targetPlanId,
      );

      if (
        parameters.items?.[1]?.price !==
        additionalPrice.stripePriceId
      ) {
        throw new AppError(
          409,
          "Pricing changed after this preview. Request a new preview.",
          {
            code: "BILLING_PLAN_STATE_CHANGED",
          },
        );
      }
    }

    const claimed = await claimBillingPlanChange(
      organizationId,
      userId,
      change.id,
    );

    if (claimed.outcome !== "submit") {
      return publicResult(claimed.change);
    }

    let response: Stripe.Subscription;

    // Only an error from this update request can establish
    // that Stripe rejected the actual submission.
    try {
      response = await stripe.subscriptions.update(
        change.stripeSubscriptionId,
        parameters,
        {
          idempotencyKey:
            `motodesk:${env.STRIPE_MODE}:plan-change:${change.id}`,
        },
      );
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.statusCode === 400
      ) {
        const rejected = await recordRejectedBillingPlanChange(
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
            code: "BILLING_PLAN_CHANGE_REJECTED",
          },
        );
      }

      try {
        const recorded = await recordUnconfirmedBillingPlanChange(
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
        // Preserve the operation claim even if recording its
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

    // Idempotent retries can return a cached Stripe response.
    // Read current state before applying the operation locally.
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
      matchesTarget(change, parameters, verifiedSnapshot)
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
      matchesSource(change, verifiedSnapshot)
    ) {
      const pending = await recordPendingBillingPlanChange(
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

    // Never expose raw SDK errors or request details.
    throw unconfirmedChange();
  }
}

//************************************************************** */