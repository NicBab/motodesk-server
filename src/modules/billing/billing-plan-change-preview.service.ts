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
  isBillingPlanId,
  type BillingPlanId,
} from "./billing.constants.js";

import {
  resolveBillingPrice,
  resolveBillingAdditionalUserPrice,
} from "./billing-price.service.js";

import {
  mapBillingSubscription,
} from "./billing-subscription.mapper.js";

import {
  createBillingPlanChangePreview,
} from "./billing-plan-change.repository.js";

import type {
  CreateBillingPlanChangePreviewInput,
} from "./billing-plan-change.schemas.js";

//************************************************************** */

const PREVIEW_LIFETIME_MS = 10 * 60 * 1_000;

export interface BillingPlanChangePreviewResult {
  changeId: string;
  currency: string;

  currentPlanId: BillingPlanId;
  targetPlanId: BillingPlanId;

  currentAdditionalUserQuantity: number;
  targetAdditionalUserQuantity: number;

  currentUserLimit: number;
  targetUserLimit: number;

  monthlyTotalAmount: number;

  estimatedInvoiceAmountDue: number;
  invoiceEstimateScope: "next_invoice";

  trialEndsAt: string | null;
  expiresAt: string;
}

//************************************************************** */

function conflict(
  code: string,
  message: string,
): AppError {
  return new AppError(409, message, { code });
}

function stateChanged(): AppError {
  return conflict(
    "BILLING_PLAN_STATE_CHANGED",
    "Billing synchronization is pending. Refresh and request a new preview.",
  );
}

//************************************************************** */

export async function previewOrganizationBillingPlanChange(
  organizationId: string,
  userId: string,
  input: CreateBillingPlanChangePreviewInput,
): Promise<BillingPlanChangePreviewResult> {
  await assertOrganizationBillingAccess(
    organizationId,
    userId,
    Permissions.BILLING_UPDATE,
  );

  if (await isOrganizationBillingExempt(organizationId)) {
    throw conflict(
      "BILLING_EXEMPT",
      "This organization is exempt from subscription billing.",
    );
  }

  const targetQuantity = input.additionalUserQuantity;

  if (
    !isBillingPlanId(input.planId) ||
    !Number.isSafeInteger(targetQuantity) ||
    targetQuantity < 0 ||
    targetQuantity > 2_147_483_647 ||
    (
      input.planId !== "pro" &&
      targetQuantity !== 0
    )
  ) {
    throw new AppError(
      400,
      "The requested plan or additional-user quantity is invalid.",
      {
        code: "BILLING_PLAN_CHANGE_INPUT_INVALID",
      },
    );
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, "Billing is currently unavailable.", {
      code: "BILLING_WEBHOOK_NOT_CONFIGURED",
    });
  }

  const billing = await prisma.organizationBilling.findUnique({
    where: { organizationId },
  });

  if (
    !billing ||
    !isBillingPlanId(billing.planId) ||
    !billing.stripeCustomerId ||
    !billing.stripeSubscriptionId ||
    !billing.stripePriceId ||
    (
      billing.status !== "ACTIVE" &&
      billing.status !== "TRIALING"
    )
  ) {
    throw conflict(
      "BILLING_ACTIVE_SUBSCRIPTION_REQUIRED",
      "An active subscription or trial is required to change plans.",
    );
  }

  if (
    billing.activePlanChangeId ||
    billing.activeUserCapacityChangeId
  ) {
    throw conflict(
      "BILLING_SUBSCRIPTION_CHANGE_PENDING",
      "Resolve the existing billing change before continuing.",
    );
  }

  if (billing.planId === input.planId) {
    throw conflict(
      "BILLING_PLAN_UNCHANGED",
      "This is already your current plan. Use the additional-user controls to change Pro user capacity.",
    );
  }

  const currentPlan = getBillingPlan(billing.planId);
  const targetPlan = getBillingPlan(input.planId);

  const monthlyTotalAmount =
    targetPlan.unitAmount +
    targetQuantity *
      (targetPlan.additionalUserPricing?.unitAmount ?? 0);

  const targetUserLimit =
    targetPlan.usersIncluded + targetQuantity;

  if (!Number.isSafeInteger(monthlyTotalAmount)) {
    throw new AppError(400, "The requested quantity is too large.", {
      code: "BILLING_PLAN_CHANGE_INPUT_INVALID",
    });
  }

  // This is an early usability check. Confirmation repeats the
  // count under the organization lock before claiming the change.
  const memberships = await prisma.membership.count({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "INVITED"] },
    },
  });

  const pendingInvitations =
    await prisma.membershipInvitation.count({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

  if (memberships + pendingInvitations > targetUserLimit) {
    throw conflict(
      "BILLING_PLAN_CAPACITY_BELOW_USAGE",
      "Remove users or pending invitations before selecting this plan.",
    );
  }

  const stripe = getStripeClient();

  try {
    const customer = await stripe.customers.retrieve(
      billing.stripeCustomerId,
    );

    if (
      customer.deleted ||
      customer.id !== billing.stripeCustomerId ||
      customer.livemode !== (env.STRIPE_MODE === "live") ||
      customer.metadata.organizationId !== organizationId
    ) {
      throw conflict(
        "BILLING_CUSTOMER_MAPPING_INVALID",
        "The organization billing account requires review.",
      );
    }

    const subscription = await stripe.subscriptions.retrieve(
      billing.stripeSubscriptionId,
    );

    if (subscription.id !== billing.stripeSubscriptionId) {
      throw stateChanged();
    }

    const snapshot = mapBillingSubscription(
      subscription,
      organizationId,
      customer.id,
      env.STRIPE_MODE === "live",
    );

    if (
      snapshot.planId !== billing.planId ||
      snapshot.status !== billing.status ||
      snapshot.stripePriceId !== billing.stripePriceId ||
      snapshot.additionalUserQuantity !==
        billing.additionalUserQuantity ||
      snapshot.additionalUserUnitAmount !==
        billing.additionalUserUnitAmount ||
      snapshot.stripeAdditionalUserPriceId !==
        billing.stripeAdditionalUserPriceId ||
      snapshot.stripeAdditionalUserItemId !==
        billing.stripeAdditionalUserItemId
    ) {
      throw stateChanged();
    }

    if (
      subscription.cancel_at_period_end ||
      subscription.cancel_at !== null
    ) {
      throw conflict(
        "BILLING_CANCELLATION_SCHEDULED",
        "Undo the scheduled cancellation before changing plans.",
      );
    }

    if (subscription.pending_update || subscription.schedule) {
      throw conflict(
        "BILLING_SUBSCRIPTION_CHANGE_PENDING",
        "Resolve the existing subscription change before continuing.",
      );
    }

    const baseItem = subscription.items.data.find(
      (item) => item.price.id === snapshot.stripePriceId,
    );

    if (!baseItem?.id) {
      throw stateChanged();
    }

    const targetPrice = await resolveBillingPrice(input.planId);

    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      {
        id: baseItem.id,
        price: targetPrice.stripePriceId,
        quantity: 1,
      },
    ];

    // A cross-plan change away from Pro removes its additional
    // user item in the same Stripe update as the base-plan change.
    if (snapshot.stripeAdditionalUserItemId) {
      items.push({
        id: snapshot.stripeAdditionalUserItemId,
        deleted: true,
      });
    }

    // Only Pro supports a separate additional-user item.
    if (targetQuantity > 0) {
      const additionalPrice =
        await resolveBillingAdditionalUserPrice(input.planId);

      items.push({
        price: additionalPrice.stripePriceId,
        quantity: targetQuantity,
      });
    }

    const prorationDate = Math.floor(Date.now() / 1_000);
    const isTrial = snapshot.status === "TRIALING";

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
      invoice.currency !== targetPlan.currency ||
      !Number.isSafeInteger(invoice.amount_due) ||
      invoice.amount_due < 0
    ) {
      throw new AppError(
        503,
        "The plan-change preview could not be verified.",
        {
          code: "BILLING_PLAN_PREVIEW_INVALID",
        },
      );
    }

    const expiresAt = new Date(
      Date.now() + PREVIEW_LIFETIME_MS,
    );

    const storedParameters = JSON.parse(
      JSON.stringify(updateParameters),
    ) as Prisma.InputJsonObject;

    const change = await createBillingPlanChangePreview(
      organizationId,
      userId,
      {
        organizationBillingId: billing.id,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        expectedStripePriceId: snapshot.stripePriceId,

        expectedPlanId: snapshot.planId,
        targetPlanId: input.planId,

        expectedAdditionalUserQuantity:
          snapshot.additionalUserQuantity,

        targetAdditionalUserQuantity: targetQuantity,
        expectedLastSyncedAt: billing.lastSyncedAt,

        prorationDate,
        currency: targetPlan.currency,
        estimatedAmountDue: BigInt(invoice.amount_due),
        monthlyTotalAmount: BigInt(monthlyTotalAmount),
        stripeUpdateParameters: storedParameters,
        expiresAt,
      },
    );

    return {
      changeId: change.id,
      currency: targetPlan.currency,

      currentPlanId: snapshot.planId,
      targetPlanId: input.planId,

      currentAdditionalUserQuantity:
        snapshot.additionalUserQuantity,

      targetAdditionalUserQuantity: targetQuantity,

      currentUserLimit:
        currentPlan.usersIncluded +
        snapshot.additionalUserQuantity,

      targetUserLimit,
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
      "The plan-change preview is temporarily unavailable.",
      {
        code: "BILLING_PLAN_PREVIEW_UNAVAILABLE",
      },
    );
  }
}

//************************************************************** */