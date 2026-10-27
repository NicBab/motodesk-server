import type Stripe from "stripe";

import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { getStripeClient } from "../../config/stripe.js";

import type {
  Prisma,
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
} from "./billing.constants.js";

import {
  resolveBillingAdditionalUserPrice,
} from "./billing-price.service.js";

import {
  mapBillingSubscription,
} from "./billing-subscription.mapper.js";

import {
  createBillingUserCapacityPreview,
} from "./billing-user-capacity.repository.js";

import type {
  CreateBillingUserCapacityPreviewInput,
} from "./billing.schemas.js";

//************************************************************** */

const PREVIEW_LIFETIME_MS = 10 * 60 * 1_000;

export interface BillingUserCapacityPreviewResult {
  changeId: string;
  currency: string;

  currentAdditionalUserQuantity: number;
  targetAdditionalUserQuantity: number;

  currentUserLimit: number;
  targetUserLimit: number;

  additionalUserUnitAmount: number;

  // Recurring list price before taxes, discounts, and credits.
  monthlyTotalAmount: number;

  // Stripe's upcoming invoice estimate, not a promise that this
  // entire amount will be charged immediately.
  estimatedInvoiceAmountDue: number;
  invoiceEstimateScope: "next_invoice";

  trialEndsAt: string | null;
  expiresAt: string;
}

//************************************************************** */

function previewConflict(
  code: string,
  message: string,
): AppError {
  return new AppError(409, message, { code });
}

//************************************************************** */

export async function previewOrganizationBillingUserCapacity(
  organizationId: string,
  userId: string,
  input: CreateBillingUserCapacityPreviewInput,
): Promise<BillingUserCapacityPreviewResult> {
  await assertOrganizationBillingAccess(
    organizationId,
    userId,
    Permissions.BILLING_UPDATE,
  );

  if (await isOrganizationBillingExempt(organizationId)) {
    throw previewConflict(
      "BILLING_EXEMPT",
      "This organization does not need to purchase additional users.",
    );
  }

  const targetQuantity = input.additionalUserQuantity;

  if (
    !Number.isSafeInteger(targetQuantity) ||
    targetQuantity < 0 ||
    targetQuantity > 2_147_483_647
  ) {
    throw new AppError(
      400,
      "Additional-user quantity is invalid.",
      {
        code: "BILLING_CAPACITY_QUANTITY_INVALID",
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

  const billing = await prisma.organizationBilling.findUnique({
    where: {
      organizationId,
    },
  });

  if (
    !billing ||
    billing.planId !== "pro" ||
    !billing.stripeCustomerId ||
    !billing.stripeSubscriptionId ||
    (
      billing.status !== "ACTIVE" &&
      billing.status !== "TRIALING"
    )
  ) {
    throw previewConflict(
      "BILLING_PRO_SUBSCRIPTION_REQUIRED",
      "An active Pro subscription or Pro trial is required.",
    );
  }

  if (billing.activeUserCapacityChangeId) {
    throw previewConflict(
      "BILLING_CAPACITY_CHANGE_IN_PROGRESS",
      "Another user-capacity change is in progress.",
    );
  }

  if (targetQuantity === billing.additionalUserQuantity) {
    throw previewConflict(
      "BILLING_CAPACITY_UNCHANGED",
      "The organization already has this user capacity.",
    );
  }

  const plan = getBillingPlan("pro");
  const pricing = plan.additionalUserPricing;

  if (!pricing) {
    throw new AppError(
      503,
      "Additional-user pricing is unavailable.",
      {
        code: "BILLING_PRICE_CONFIGURATION_INVALID",
      },
    );
  }

  const monthlyTotalAmount =
    plan.unitAmount + targetQuantity * pricing.unitAmount;

  if (!Number.isSafeInteger(monthlyTotalAmount)) {
    throw new AppError(
      400,
      "Additional-user quantity is too large.",
      {
        code: "BILLING_CAPACITY_QUANTITY_INVALID",
      },
    );
  }

  const stripe = getStripeClient();

  try {
    const customer = await stripe.customers.retrieve(
      billing.stripeCustomerId,
    );

    if (
      customer.deleted ||
      customer.livemode !== (env.STRIPE_MODE === "live") ||
      customer.metadata.organizationId !== organizationId
    ) {
      throw previewConflict(
        "BILLING_CUSTOMER_MAPPING_INVALID",
        "The organization billing account requires review.",
      );
    }

    const subscription = await stripe.subscriptions.retrieve(
      billing.stripeSubscriptionId,
    );

    const snapshot = mapBillingSubscription(
      subscription,
      organizationId,
      customer.id,
      env.STRIPE_MODE === "live",
    );

    if (
      snapshot.planId !== "pro" ||
      (
        snapshot.status !== "ACTIVE" &&
        snapshot.status !== "TRIALING"
      ) ||
      snapshot.status !== billing.status ||
      snapshot.additionalUserQuantity !==
        billing.additionalUserQuantity ||
      snapshot.stripeAdditionalUserPriceId !==
        billing.stripeAdditionalUserPriceId ||
      snapshot.stripeAdditionalUserItemId !==
        billing.stripeAdditionalUserItemId
    ) {
      throw previewConflict(
        "BILLING_CAPACITY_STATE_CHANGED",
        "Billing synchronization is pending. Refresh and try again.",
      );
    }

    if (
      subscription.cancel_at_period_end ||
      subscription.cancel_at !== null
    ) {
      throw previewConflict(
        "BILLING_CANCELLATION_SCHEDULED",
        "Undo the scheduled cancellation before changing user capacity.",
      );
    }

    if (subscription.pending_update || subscription.schedule) {
      throw previewConflict(
        "BILLING_SUBSCRIPTION_CHANGE_PENDING",
        "Resolve the existing subscription change before continuing.",
      );
    }

    const items: Stripe.SubscriptionUpdateParams.Item[] = [];

    if (snapshot.stripeAdditionalUserItemId) {
      if (targetQuantity === 0) {
        items.push({
          id: snapshot.stripeAdditionalUserItemId,
          deleted: true,
        });
      } else {
        items.push({
          id: snapshot.stripeAdditionalUserItemId,
          quantity: targetQuantity,
        });
      }
    } else {
      if (targetQuantity === 0) {
        throw previewConflict(
          "BILLING_CAPACITY_UNCHANGED",
          "The organization already has this user capacity.",
        );
      }

      const additionalPrice =
        await resolveBillingAdditionalUserPrice("pro");

      items.push({
        price: additionalPrice.stripePriceId,
        quantity: targetQuantity,
      });
    }

    const prorationDate = Math.floor(Date.now() / 1_000);
    const isTrial = snapshot.status === "TRIALING";

    // Trial changes preserve the existing trial and create no
    // immediate prorations. Paid changes invoice prorations.
    const prorationBehavior = isTrial
      ? "none"
      : "always_invoice";

    const updateParameters: Stripe.SubscriptionUpdateParams = {
      items,
      payment_behavior: "pending_if_incomplete",
      proration_behavior: prorationBehavior,

      ...(!isTrial
        ? { proration_date: prorationDate }
        : {}),
    };

    const invoice = await stripe.invoices.createPreview({
      customer: customer.id,
      subscription: subscription.id,

      subscription_details: {
        items,
        proration_behavior: prorationBehavior,

        ...(!isTrial
          ? { proration_date: prorationDate }
          : {}),
      },
    });

    const invoiceCustomerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;

    if (
      invoiceCustomerId !== customer.id ||
      invoice.livemode !== (env.STRIPE_MODE === "live") ||
      invoice.currency !== plan.currency ||
      !Number.isSafeInteger(invoice.amount_due) ||
      invoice.amount_due < 0
    ) {
      throw new AppError(
        503,
        "The billing preview could not be verified.",
        {
          code: "BILLING_CAPACITY_PREVIEW_INVALID",
        },
      );
    }

    const expiresAt = new Date(
      Date.now() + PREVIEW_LIFETIME_MS,
    );

    // These parameters contain only server-created identifiers,
    // quantities, and billing options. JSON serialization removes
    // optional undefined properties before Prisma persistence.
    const storedParameters = JSON.parse(
      JSON.stringify(updateParameters),
    ) as Prisma.InputJsonObject;

    const change = await createBillingUserCapacityPreview(
      organizationId,
      userId,
      {
        organizationBillingId: billing.id,

        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,

        expectedAdditionalUserQuantity:
          billing.additionalUserQuantity,

        targetAdditionalUserQuantity: targetQuantity,

        expectedLastSyncedAt: billing.lastSyncedAt,

        prorationDate,
        currency: plan.currency,

        estimatedAmountDue: BigInt(invoice.amount_due),
        monthlyTotalAmount: BigInt(monthlyTotalAmount),

        stripeUpdateParameters: storedParameters,

        expiresAt,
      },
    );

    return {
      changeId: change.id,
      currency: plan.currency,

      currentAdditionalUserQuantity:
        billing.additionalUserQuantity,

      targetAdditionalUserQuantity: targetQuantity,

      currentUserLimit:
        plan.usersIncluded + billing.additionalUserQuantity,

      targetUserLimit:
        plan.usersIncluded + targetQuantity,

      additionalUserUnitAmount: pricing.unitAmount,
      monthlyTotalAmount,

      estimatedInvoiceAmountDue: invoice.amount_due,
      invoiceEstimateScope: "next_invoice",

      trialEndsAt: snapshot.trialEndsAt?.toISOString() ?? null,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      503,
      "The user-capacity preview is temporarily unavailable.",
      {
        code: "BILLING_CAPACITY_PREVIEW_UNAVAILABLE",
      },
    );
  }
}

//************************************************************** */