import { env } from "../../config/env.js";

import { prisma } from "../../config/prisma.js";

import {
  BillingSubscriptionStatus,
  MembershipStatus,
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
  BILLING_PLAN_IDS,
  getBillingPlan,
  isBillingPlanId,
} from "./billing.constants.js";

import {
  findOrganizationBilling,
} from "./billing.repository.js";

//************************************************************** */

function invalidBillingConfiguration(): AppError {
  return new AppError(
    503,
    "The organization billing configuration requires review.",
    {
      code: "BILLING_PLAN_CONFIGURATION_INVALID",
    },
  );
}

//************************************************************** */

export async function getOrganizationBillingOverview(
  organizationId: string,
  userId: string,
) {
  await assertOrganizationBillingAccess(
    organizationId,
    userId,
    Permissions.BILLING_VIEW,
  );

  const [
    billing,
    billingExempt,
    assignedUsers,
  ] = await Promise.all([
    findOrganizationBilling(organizationId),

    isOrganizationBillingExempt(organizationId),

    prisma.membership.count({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
      },
    }),
  ]);

  const storedPlanId = billing?.planId ?? null;

  if (
    storedPlanId !== null &&
    !isBillingPlanId(storedPlanId)
  ) {
    throw invalidBillingConfiguration();
  }

  const plan =
    storedPlanId !== null
      ? getBillingPlan(storedPlanId)
      : null;

  const additionalUserQuantity =
    billing?.additionalUserQuantity ?? 0;

  const additionalUserUnitAmount =
    billing?.additionalUserUnitAmount ?? null;

  const additionalUserPriceId =
    billing?.stripeAdditionalUserPriceId ?? null;

  const additionalUserItemId =
    billing?.stripeAdditionalUserItemId ?? null;

  if (
    !Number.isSafeInteger(additionalUserQuantity) ||
    additionalUserQuantity < 0 ||
    additionalUserQuantity > 2_147_483_647
  ) {
    throw invalidBillingConfiguration();
  }

  if (additionalUserQuantity > 0) {
    if (
      !plan?.additionalUserPricing ||
      additionalUserUnitAmount !==
        plan.additionalUserPricing.unitAmount ||
      !additionalUserPriceId ||
      !additionalUserItemId
    ) {
      throw invalidBillingConfiguration();
    }
  } else if (
    additionalUserUnitAmount !== null ||
    additionalUserPriceId !== null ||
    additionalUserItemId !== null
  ) {
    // A base-only subscription should not retain stale add-on data.
    throw invalidBillingConfiguration();
  }

  const additionalUserMonthlyAmount =
    additionalUserQuantity * (additionalUserUnitAmount ?? 0);

  const monthlyTotalAmount = plan
    ? plan.unitAmount + additionalUserMonthlyAmount
    : null;

  const purchasedUserCapacity = plan
    ? plan.usersIncluded + additionalUserQuantity
    : 0;

  if (
    !Number.isSafeInteger(additionalUserMonthlyAmount) ||
    !Number.isSafeInteger(purchasedUserCapacity) ||
    (
      monthlyTotalAmount !== null &&
      !Number.isSafeInteger(monthlyTotalAmount)
    )
  ) {
    throw invalidBillingConfiguration();
  }

  return {
    organizationId,

    configured: Boolean(
      env.STRIPE_SECRET_KEY &&
      env.STRIPE_WEBHOOK_SECRET,
    ),

    billingExempt,

    availablePlans: BILLING_PLAN_IDS.map((planId) => {
      const availablePlan = getBillingPlan(planId);

      return {
        id: availablePlan.id,
        name: availablePlan.name,
        currency: availablePlan.currency,
        interval: availablePlan.interval,
        unitAmount: availablePlan.unitAmount,
        usersIncluded: availablePlan.usersIncluded,

        additionalUserPricing:
          availablePlan.additionalUserPricing
            ? {
                unitAmount:
                  availablePlan.additionalUserPricing.unitAmount,
              }
            : null,

        trialDays: availablePlan.trialDays,
        recommended: availablePlan.recommended,
      };
    }),

    subscription: {
      status:
        billing?.status ??
        BillingSubscriptionStatus.NOT_SUBSCRIBED,

      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            currency: plan.currency,
            interval: plan.interval,
            unitAmount: plan.unitAmount,
            usersIncluded: plan.usersIncluded,

            additionalUserPricing: plan.additionalUserPricing
              ? {
                  unitAmount:
                    plan.additionalUserPricing.unitAmount,
                }
              : null,
          }
        : null,

      additionalUserQuantity,
      additionalUserUnitAmount,
      additionalUserMonthlyAmount,

      // Recurring list-price total before taxes, discounts,
      // credits, or prorations. This is not an invoice balance.
      monthlyTotalAmount,

      currentPeriodStart:
        billing?.currentPeriodStart?.toISOString() ?? null,

      currentPeriodEnd:
        billing?.currentPeriodEnd?.toISOString() ?? null,

      trialStartedAt:
        billing?.trialStartedAt?.toISOString() ?? null,

      trialEndsAt:
        billing?.trialEndsAt?.toISOString() ?? null,

      cancelAtPeriodEnd:
        billing?.cancelAtPeriodEnd ?? false,

      cancelAt:
        billing?.cancelAt?.toISOString() ?? null,

      canceledAt:
        billing?.canceledAt?.toISOString() ?? null,

      endedAt:
        billing?.endedAt?.toISOString() ?? null,
    },

    usage: {
      assignedUsers,

      // Null represents exempt, unlimited capacity.
      // Capacity alone does not establish subscription access.
      userLimit: billingExempt ? null : purchasedUserCapacity,
    },

    checkoutPending: Boolean(
      billing?.checkoutOperationId,
    ),

    lastSyncedAt:
      billing?.lastSyncedAt?.toISOString() ?? null,
  };
}

//************************************************************** */