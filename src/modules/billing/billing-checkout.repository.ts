
import { prisma } from "../../config/prisma.js";

import {
  BillingSubscriptionStatus,
  MembershipStatus,
  OrganizationStatus,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  getBillingPlan,
  type BillingPlanId,
} from "./billing.constants.js";

import {
  lockOrganizationUserCapacity,
} from "./billing-capacity.service.js";

//************************************************************** */

export async function claimOrganizationCheckout(
  organizationId: string,
  stripeCustomerId: string,
  operationId: string,
  planId: BillingPlanId,
): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const organization =
      await transaction.organization.findUnique({
        where: { id: organizationId },
        select: { status: true },
      });

    if (organization?.status !== OrganizationStatus.ACTIVE) {
      throw new AppError(
        404,
        "Organization not found.",
        { code: "ORGANIZATION_NOT_FOUND" },
      );
    }

    const billing =
      await transaction.organizationBilling.findUnique({
        where: { organizationId },
        select: {
          activePlanChangeId: true,
          activeUserCapacityChangeId: true,
        },
      });

    if (
      billing?.activePlanChangeId ||
      billing?.activeUserCapacityChangeId
    ) {
      throw new AppError(
        409,
        "A billing change requires reconciliation.",
        { code: "BILLING_CHECKOUT_CHANGE_PENDING" },
      );
    }

    const [
      assignedUsers,
      reservedMemberships,
      pendingInvitations,
    ] = await Promise.all([
      transaction.membership.count({
        where: {
          organizationId,
          status: MembershipStatus.ACTIVE,
        },
      }),

      transaction.membership.count({
        where: {
          organizationId,
          status: MembershipStatus.INVITED,
        },
      }),

      transaction.membershipInvitation.count({
        where: {
          organizationId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    const usedCapacity =
      assignedUsers +
      reservedMemberships +
      pendingInvitations;

    const plan = getBillingPlan(planId);

    if (usedCapacity > plan.usersIncluded) {
      throw new AppError(
        409,
        planId === "pro"
          ? "Additional Pro users must be configured before resubscribing."
          : "The selected plan does not have enough user capacity.",
        {
          code:
            planId === "pro"
              ? "BILLING_CHECKOUT_ADDITIONAL_USERS_REQUIRED"
              : "BILLING_CHECKOUT_USER_LIMIT_EXCEEDED",
          details: {
            planId,
            includedUsers: plan.usersIncluded,
            usedCapacity,
            assignedUsers,
            reservedMemberships,
            pendingInvitations,
            additionalUsersRequired:
              usedCapacity - plan.usersIncluded,
          },
        },
      );
    }

    // The checkout claim is committed in the same
    // transaction as the capacity validation.

    const result =
      await transaction.organizationBilling.updateMany({
        where: {
          organizationId,
          stripeCustomerId,

          status: {
            in: [
              BillingSubscriptionStatus.NOT_SUBSCRIBED,
              BillingSubscriptionStatus.CANCELED,
              BillingSubscriptionStatus.INCOMPLETE_EXPIRED,
            ],
          },

          checkoutOperationId: null,
          checkoutSessionId: null,
          checkoutSessionExpiresAt: null,
        },

        data: {
          checkoutOperationId: operationId,
        },
      });

    return result.count === 1;
  });
}

//************************************************************** */

export async function saveOrganizationCheckoutSession(
  organizationId: string,
  operationId: string,
  stripeCustomerId: string,
  checkoutSessionId: string,
  expiresAt: Date,
): Promise<boolean> {
  const result = await prisma.organizationBilling.updateMany({
    where: {
      organizationId,
      stripeCustomerId,
      checkoutOperationId: operationId,
      checkoutSessionId: null,
    },

    data: {
      checkoutSessionId,
      checkoutSessionExpiresAt: expiresAt,
    },
  });

  return result.count === 1;
}

//************************************************************** */

// Only call after a definitive rejection of session creation.
// A timeout or interrupted response does not establish rejection.

export async function releaseRejectedOrganizationCheckout(
  organizationId: string,
  stripeCustomerId: string,
  operationId: string,
): Promise<boolean> {
  const result = await prisma.organizationBilling.updateMany({
    where: {
      organizationId,
      stripeCustomerId,
      checkoutOperationId: operationId,
      checkoutSessionId: null,
      checkoutSessionExpiresAt: null,

      status: {
        in: [
          BillingSubscriptionStatus.NOT_SUBSCRIBED,
          BillingSubscriptionStatus.CANCELED,
          BillingSubscriptionStatus.INCOMPLETE_EXPIRED,
        ],
      },
    },

    data: {
      checkoutOperationId: null,
    },
  });

  return result.count === 1;
}

//************************************************************** */

export async function clearExpiredOrganizationCheckout(
  organizationId: string,
  operationId: string,
  checkoutSessionId: string,
): Promise<boolean> {
  const result = await prisma.organizationBilling.updateMany({
    where: {
      organizationId,
      checkoutOperationId: operationId,
      checkoutSessionId,

      checkoutSessionExpiresAt: {
        lte: new Date(),
      },

      status: {
        in: [
          BillingSubscriptionStatus.NOT_SUBSCRIBED,
          BillingSubscriptionStatus.CANCELED,
          BillingSubscriptionStatus.INCOMPLETE_EXPIRED,
        ],
      },
    },

    data: {
      checkoutOperationId: null,
      checkoutSessionId: null,
      checkoutSessionExpiresAt: null,
    },
  });

  return result.count === 1;
}

//************************************************************** */
