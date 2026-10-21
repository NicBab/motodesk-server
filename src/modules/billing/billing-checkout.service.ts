import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import { getStripeClient } from "../../config/stripe.js";

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
} from "./billing.constants.js";

import {
  ensureOrganizationStripeCustomer,
} from "./billing-customer.service.js";

import {
  recoverOrganizationCheckout,
} from "./billing-checkout-recovery.service.js";

import {
  resolveBillingPrice,
} from "./billing-price.service.js";

import {
  findOrganizationBilling,
} from "./billing.repository.js";

import {
  claimOrganizationCheckout,
  clearExpiredOrganizationCheckout,
  saveOrganizationCheckoutSession,
} from "./billing-checkout.repository.js";

import type {
  CreateBillingCheckoutInput,
} from "./billing.schemas.js";

//************************************************************** */

export interface BillingCheckoutResult {
  url: string;
}

function checkoutConflict(
  code: string,
  message: string,
): AppError {
  return new AppError(409, message, { code });
}

//************************************************************** */

export async function createOrganizationBillingCheckout(
  organizationId: string,
  userId: string,
  input: CreateBillingCheckoutInput,
): Promise<BillingCheckoutResult> {
  await assertOrganizationBillingAccess(
    organizationId,
    userId,
    Permissions.BILLING_UPDATE,
  );

  if (await isOrganizationBillingExempt(organizationId)) {
    throw checkoutConflict(
      "BILLING_EXEMPT",
      "This organization is exempt from subscription billing.",
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

  const stripe = getStripeClient();
  const plan = getBillingPlan(input.planId);

  const customerId = await ensureOrganizationStripeCustomer(
    organizationId,
  );

  let billing = await findOrganizationBilling(organizationId);

  if (!billing || billing.stripeCustomerId !== customerId) {
    throw checkoutConflict(
      "BILLING_CUSTOMER_MAPPING_CONFLICT",
      "The organization billing account requires review.",
    );
  }

  // Recover a Stripe session whose creation response may have
  // been interrupted before its ID was saved locally.
  if (
    billing.checkoutOperationId &&
    !billing.checkoutSessionId
  ) {
    try {
      await recoverOrganizationCheckout(organizationId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        503,
        "Checkout recovery is temporarily unavailable.",
        {
          code: "BILLING_CHECKOUT_RECOVERY_UNAVAILABLE",
        },
      );
    }

    billing = await findOrganizationBilling(organizationId);

    if (!billing || billing.stripeCustomerId !== customerId) {
      throw checkoutConflict(
        "BILLING_CUSTOMER_MAPPING_CONFLICT",
        "The organization billing account requires review.",
      );
    }
  }

  // Check Stripe as well as local state to cover webhook delays.
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  if (subscriptions.has_more) {
    throw checkoutConflict(
      "BILLING_SUBSCRIPTION_REVIEW_REQUIRED",
      "The organization billing account requires review.",
    );
  }

  const hasCurrentSubscription = subscriptions.data.some(
    (subscription) =>
      subscription.status !== "canceled" &&
      subscription.status !== "incomplete_expired",
  );

  if (hasCurrentSubscription) {
    throw checkoutConflict(
      "BILLING_SUBSCRIPTION_ALREADY_EXISTS",
      "Manage the existing subscription instead of starting another.",
    );
  }

  if (billing.checkoutSessionId) {
    if (!billing.checkoutOperationId) {
      throw checkoutConflict(
        "BILLING_CHECKOUT_REVIEW_REQUIRED",
        "The existing checkout requires review.",
      );
    }

    const existing = await stripe.checkout.sessions.retrieve(
      billing.checkoutSessionId,
    );

    const existingCustomerId =
      typeof existing.customer === "string"
        ? existing.customer
        : existing.customer?.id;

    if (
      existing.mode !== "subscription" ||
      existingCustomerId !== customerId ||
      existing.livemode !== (env.STRIPE_MODE === "live") ||
      existing.client_reference_id !== organizationId ||
      existing.metadata?.organizationId !== organizationId ||
      existing.metadata?.checkoutOperationId !==
        billing.checkoutOperationId
    ) {
      throw checkoutConflict(
        "BILLING_CHECKOUT_MAPPING_INVALID",
        "The existing checkout requires review.",
      );
    }

    if (existing.status === "open") {
      if (existing.metadata?.planId !== input.planId) {
        throw checkoutConflict(
          "BILLING_CHECKOUT_PLAN_CONFLICT",
          "Finish or wait for the existing checkout to expire before selecting another plan.",
        );
      }

      if (!existing.url) {
        throw checkoutConflict(
          "BILLING_CHECKOUT_URL_UNAVAILABLE",
          "The existing checkout requires review.",
        );
      }

      return { url: existing.url };
    }

    if (existing.status !== "expired") {
      throw checkoutConflict(
        "BILLING_CHECKOUT_AWAITING_SYNC",
        "Checkout has completed. Billing confirmation is pending.",
      );
    }

    const cleared = await clearExpiredOrganizationCheckout(
      organizationId,
      billing.checkoutOperationId,
      billing.checkoutSessionId,
    );

    if (!cleared) {
      throw checkoutConflict(
        "BILLING_CHECKOUT_STATE_CHANGED",
        "Billing changed during this request. Refresh and try again.",
      );
    }

    billing = await findOrganizationBilling(organizationId);

    if (!billing || billing.stripeCustomerId !== customerId) {
      throw checkoutConflict(
        "BILLING_CUSTOMER_MAPPING_CONFLICT",
        "The organization billing account requires review.",
      );
    }
  }

  // Absence from Stripe's list is not proof that the original
  // creation failed. Keep unresolved claims blocked.
  if (billing.checkoutOperationId) {
    throw checkoutConflict(
      "BILLING_CHECKOUT_RECONCILIATION_REQUIRED",
      "Checkout is being prepared or requires reconciliation.",
    );
  }

  const price = await resolveBillingPrice(input.planId);

  const eligibleForTrial =
    billing.trialStartedAt === null &&
    subscriptions.data.length === 0;

  const operationId = randomUUID();

  const claimed = await claimOrganizationCheckout(
    organizationId,
    customerId,
    operationId,
  );

  if (!claimed) {
    throw checkoutConflict(
      "BILLING_CHECKOUT_STATE_CHANGED",
      "Another checkout or billing update is in progress.",
    );
  }

  const successUrl = new URL("/settings", env.CLIENT_URL);
  successUrl.searchParams.set("billing", "success");

  const cancelUrl = new URL("/settings", env.CLIENT_URL);
  cancelUrl.searchParams.set("billing", "canceled");

  const metadata = {
    organizationId,
    planId: input.planId,
    checkoutOperationId: operationId,
  };

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",

        customer: customerId,
        client_reference_id: organizationId,

        line_items: [
          {
            price: price.stripePriceId,
            quantity: 1,
          },
        ],

        payment_method_collection: "always",

        customer_update: {
          name: "auto",
          address: "auto",
        },

        subscription_data: {
          metadata,

          ...(eligibleForTrial
            ? { trial_period_days: plan.trialDays }
            : {}),
        },

        metadata,

        success_url: successUrl.toString(),
        cancel_url: cancelUrl.toString(),
      },
      {
        idempotencyKey:
          `motodesk:${env.STRIPE_MODE}:checkout:${operationId}`,
      },
    );

    const saved = await saveOrganizationCheckoutSession(
      organizationId,
      operationId,
      customerId,
      session.id,
      new Date(session.expires_at * 1_000),
    );

    if (!saved || !session.url) {
      throw checkoutConflict(
        "BILLING_CHECKOUT_RECONCILIATION_REQUIRED",
        "Checkout requires reconciliation before continuing.",
      );
    }

    return { url: session.url };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    // Retain the claim because Stripe may have accepted the request.
    throw new AppError(
      503,
      "Checkout could not be confirmed. Refresh billing before trying again.",
      {
        code: "BILLING_CHECKOUT_UNCONFIRMED",
      },
    );
  }
}

//************************************************************** */