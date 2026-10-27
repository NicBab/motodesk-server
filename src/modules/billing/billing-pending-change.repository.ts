import { prisma } from "../../config/prisma.js";

import type {
  OrganizationBilling,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  lockOrganizationUserCapacity,
} from "./billing-capacity.service.js";

import {
  getBillingPlan,
  isBillingPlanId,
  type BillingPlanId,
} from "./billing.constants.js";

//************************************************************** */

export interface BillingPendingChange {
  kind: "PLAN_CHANGE" | "USER_CAPACITY_CHANGE";

  // Only the original requester can resume confirmation.
  changeId: string | null;
  requestedByCurrentUser: boolean;

  status:
    | "PROCESSING"
    | "PENDING_PAYMENT"
    | "RECONCILIATION_REQUIRED";

  targetPlanId: BillingPlanId;
  targetAdditionalUserQuantity: number;
  targetUserLimit: number;

  currency: string;
  monthlyTotalAmount: number;
  submittedAt: string | null;
}

export interface BillingOverviewState {
  billing: OrganizationBilling | null;
  pendingChange: BillingPendingChange | null;
}

//************************************************************** */

function invalidConfiguration(): AppError {
  return new AppError(
    503,
    "The organization billing configuration requires review.",
    {
      code: "BILLING_PLAN_CONFIGURATION_INVALID",
    },
  );
}

interface PendingOperation {
  id: string;
  requestedByUserId: string;
  status: string;

  stripeCustomerId: string;
  stripeSubscriptionId: string;

  targetAdditionalUserQuantity: number;

  currency: string;
  monthlyTotalAmount: bigint;
  submittedAt: Date | null;
}

function publicPendingChange(
  kind: BillingPendingChange["kind"],
  billing: OrganizationBilling,
  operation: PendingOperation,
  targetPlanId: string,
  userId: string,
): BillingPendingChange {
  if (
    !isBillingPlanId(targetPlanId) ||
    (
      operation.status !== "PROCESSING" &&
      operation.status !== "PENDING_PAYMENT" &&
      operation.status !== "RECONCILIATION_REQUIRED"
    ) ||
    !billing.stripeCustomerId ||
    !billing.stripeSubscriptionId ||
    operation.stripeCustomerId !== billing.stripeCustomerId ||
    operation.stripeSubscriptionId !== billing.stripeSubscriptionId ||
    !Number.isSafeInteger(operation.targetAdditionalUserQuantity) ||
    operation.targetAdditionalUserQuantity < 0 ||
    operation.targetAdditionalUserQuantity > 2_147_483_647 ||
    (
      targetPlanId !== "pro" &&
      operation.targetAdditionalUserQuantity !== 0
    )
  ) {
    throw invalidConfiguration();
  }

  const targetPlan = getBillingPlan(targetPlanId);

  const expectedMonthlyTotal =
    BigInt(targetPlan.unitAmount) +
    BigInt(operation.targetAdditionalUserQuantity) *
      BigInt(targetPlan.additionalUserPricing?.unitAmount ?? 0);

  if (
    operation.currency !== targetPlan.currency ||
    operation.monthlyTotalAmount !== expectedMonthlyTotal ||
    expectedMonthlyTotal > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw invalidConfiguration();
  }

  const requestedByCurrentUser =
    operation.requestedByUserId === userId;

  return {
    kind,

    changeId: requestedByCurrentUser
      ? operation.id
      : null,

    requestedByCurrentUser,
    status: operation.status,

    targetPlanId,
    targetAdditionalUserQuantity:
      operation.targetAdditionalUserQuantity,

    targetUserLimit:
      targetPlan.usersIncluded +
      operation.targetAdditionalUserQuantity,

    currency: operation.currency,
    monthlyTotalAmount: Number(expectedMonthlyTotal),
    submittedAt: operation.submittedAt?.toISOString() ?? null,
  };
}

//************************************************************** */

// Internal read function, not an authorization check.
// The overview service must authorize BILLING_VIEW first.
//
// Read the billing record and its operation under the same locks
// used by confirmation and webhook reconciliation. This avoids
// combining a stale claim pointer with a newly completed operation.
export async function readBillingOverviewState(
  organizationId: string,
  userId: string,
): Promise<BillingOverviewState> {
  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const billing =
      await transaction.organizationBilling.findUnique({
        where: {
          organizationId,
        },
      });

    if (!billing) {
      return {
        billing: null,
        pendingChange: null,
      };
    }

    if (
      billing.activePlanChangeId &&
      billing.activeUserCapacityChangeId
    ) {
      throw invalidConfiguration();
    }

    if (billing.activePlanChangeId) {
      const change = await transaction.billingPlanChange.findFirst({
        where: {
          id: billing.activePlanChangeId,
          organizationBillingId: billing.id,
        },
      });

      if (!change) {
        throw invalidConfiguration();
      }

      return {
        billing,

        pendingChange: publicPendingChange(
          "PLAN_CHANGE",
          billing,
          change,
          change.targetPlanId,
          userId,
        ),
      };
    }

    if (billing.activeUserCapacityChangeId) {
      const change =
        await transaction.billingUserCapacityChange.findFirst({
          where: {
            id: billing.activeUserCapacityChangeId,
            organizationBillingId: billing.id,
          },
        });

      if (!change || billing.planId !== "pro") {
        throw invalidConfiguration();
      }

      return {
        billing,

        pendingChange: publicPendingChange(
          "USER_CAPACITY_CHANGE",
          billing,
          change,
          "pro",
          userId,
        ),
      };
    }

    return {
      billing,
      pendingChange: null,
    };
  });
}

//************************************************************** */