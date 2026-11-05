
import { prisma } from "../../config/prisma.js";

import {
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

export interface CheckoutCapacitySnapshot {
  planId: BillingPlanId;
  includedUsers: number;
  assignedUsers: number;
  reservedMemberships: number;
  pendingInvitations: number;
  usedCapacity: number;
  additionalUsersRequired: number;
}

//************************************************************** */

// Validate capacity for a new checkout or resubscription.
//
// Unlike assertOrganizationUserCapacity(), this does not
// require an existing ACTIVE or TRIALING subscription.
//
// This function does not authorize checkout. The existing
// billing permission checks must remain in place.

export async function assertCheckoutUserCapacity(
  organizationId: string,
  planId: BillingPlanId,
): Promise<CheckoutCapacitySnapshot> {
  const plan = getBillingPlan(planId);

  return prisma.$transaction(async (transaction) => {
    // Use the existing organization/billing lock order.
    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const organization =
      await transaction.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          status: true,
        },
      });

    if (
      !organization ||
      organization.status !== OrganizationStatus.ACTIVE
    ) {
      throw new AppError(
        404,
        "Organization not found.",
        {
          code: "ORGANIZATION_NOT_FOUND",
        },
      );
    }

    const billing =
      await transaction.organizationBilling.findUnique({
        where: {
          organizationId,
        },
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
        "A billing change is still being processed. Refresh billing before starting checkout.",
        {
          code: "BILLING_CAPACITY_CHANGE_PENDING",
        },
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
          expiresAt: {
            gt: new Date(),
          },
        },
      }),
    ]);

    const usedCapacity =
      assignedUsers +
      reservedMemberships +
      pendingInvitations;

    const additionalUsersRequired = Math.max(
      0,
      usedCapacity - plan.usersIncluded,
    );

    const snapshot: CheckoutCapacitySnapshot = {
      planId,
      includedUsers: plan.usersIncluded,
      assignedUsers,
      reservedMemberships,
      pendingInvitations,
      usedCapacity,
      additionalUsersRequired,
    };

    // Pro can support additional purchased users,
    // but the initial checkout flow currently creates
    // only the base subscription line item.
    //
    // Until additional-user quantities are included
    // and reconciled in checkout, do not create an
    // under-capacity Pro subscription.

    if (additionalUsersRequired > 0) {
      throw new AppError(
        409,
        planId === "pro"
          ? "This organization exceeds the ten included Pro users. Additional-user checkout must be configured before resubscribing."
          : "This organization exceeds the selected plan's user limit. Remove unused reservations or choose a larger plan.",
        {
          code:
            planId === "pro"
              ? "BILLING_CHECKOUT_ADDITIONAL_USERS_REQUIRED"
              : "BILLING_CHECKOUT_USER_LIMIT_EXCEEDED",
          details: {
            planId,
            includedUsers: plan.usersIncluded,
            assignedUsers,
            reservedMemberships,
            pendingInvitations,
            usedCapacity,
            additionalUsersRequired,
          },
        },
      );
    }

    return snapshot;
  });
}

//************************************************************** */
