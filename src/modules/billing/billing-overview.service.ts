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
    throw new AppError(
      503,
      "The organization billing configuration requires review.",
      {
        code: "BILLING_PLAN_CONFIGURATION_INVALID",
      },
    );
  }

  const plan =
    storedPlanId !== null
      ? getBillingPlan(storedPlanId)
      : null;

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
          }
        : null,

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
    },

    checkoutPending: Boolean(
      billing?.checkoutOperationId,
    ),

    lastSyncedAt:
      billing?.lastSyncedAt?.toISOString() ?? null,
  };
}

//************************************************************** */