import { prisma } from "../../config/prisma.js";

import type {
  BillingUserCapacityChange,
  Prisma,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  lockOrganizationUserCapacity,
} from "./billing-capacity.service.js";

//************************************************************** */

const SUBMISSION_RETRY_WINDOW_MS = 23 * 60 * 60 * 1_000;

export interface BillingUserCapacityPreviewData {
  organizationBillingId: string;

  stripeCustomerId: string;
  stripeSubscriptionId: string;

  expectedAdditionalUserQuantity: number;
  targetAdditionalUserQuantity: number;

  expectedLastSyncedAt: Date | null;

  prorationDate: number;
  currency: string;

  estimatedAmountDue: bigint;
  monthlyTotalAmount: bigint;

  stripeUpdateParameters: Prisma.InputJsonObject;

  expiresAt: Date;
}

export interface ClaimedBillingUserCapacityChange {
  outcome: "submit" | "pending_payment" | "applied";
  change: BillingUserCapacityChange;
}

//************************************************************** */

function changeConflict(
  code: string,
  message: string,
): AppError {
  return new AppError(409, message, { code });
}

function sameTimestamp(
  left: Date | null,
  right: Date | null,
): boolean {
  return left?.getTime() === right?.getTime();
}

//************************************************************** */

// Internal repository functions. The service must authorize
// BILLING_UPDATE before creating or confirming a preview.

export async function findBillingUserCapacityChange(
  organizationId: string,
  requestedByUserId: string,
  changeId: string,
) {
  return prisma.billingUserCapacityChange.findFirst({
    where: {
      id: changeId,
      requestedByUserId,

      organizationBilling: {
        organizationId,
      },
    },
  });
}

//************************************************************** */

export async function createBillingUserCapacityPreview(
  organizationId: string,
  requestedByUserId: string,
  preview: BillingUserCapacityPreviewData,
): Promise<BillingUserCapacityChange> {
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

    if (
      !billing ||
      billing.id !== preview.organizationBillingId ||
      billing.planId !== "pro" ||
      (
        billing.status !== "ACTIVE" &&
        billing.status !== "TRIALING"
      ) ||
      billing.stripeCustomerId !== preview.stripeCustomerId ||
      billing.stripeSubscriptionId !==
        preview.stripeSubscriptionId ||
      billing.additionalUserQuantity !==
        preview.expectedAdditionalUserQuantity ||
      !sameTimestamp(
        billing.lastSyncedAt,
        preview.expectedLastSyncedAt,
      )
    ) {
      throw changeConflict(
        "BILLING_CAPACITY_STATE_CHANGED",
        "Billing changed while preparing this preview. Refresh and try again.",
      );
    }

    if (billing.activeUserCapacityChangeId) {
      throw changeConflict(
        "BILLING_CAPACITY_CHANGE_IN_PROGRESS",
        "Another user-capacity change is in progress.",
      );
    }

    if (preview.expiresAt.getTime() <= Date.now()) {
      throw changeConflict(
        "BILLING_CAPACITY_PREVIEW_EXPIRED",
        "This preview expired. Request a new preview.",
      );
    }

    return transaction.billingUserCapacityChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId,

        stripeCustomerId: preview.stripeCustomerId,
        stripeSubscriptionId: preview.stripeSubscriptionId,

        expectedAdditionalUserQuantity:
          preview.expectedAdditionalUserQuantity,

        targetAdditionalUserQuantity:
          preview.targetAdditionalUserQuantity,

        expectedLastSyncedAt: preview.expectedLastSyncedAt,

        prorationDate: preview.prorationDate,
        currency: preview.currency,

        estimatedAmountDue: preview.estimatedAmountDue,
        monthlyTotalAmount: preview.monthlyTotalAmount,

        stripeUpdateParameters: preview.stripeUpdateParameters,

        expiresAt: preview.expiresAt,
      },
    });
  });
}

//************************************************************** */

export async function claimBillingUserCapacityChange(
  organizationId: string,
  requestedByUserId: string,
  changeId: string,
): Promise<ClaimedBillingUserCapacityChange> {
  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const change =
      await transaction.billingUserCapacityChange.findFirst({
        where: {
          id: changeId,
          requestedByUserId,

          organizationBilling: {
            organizationId,
          },
        },
      });

    if (!change) {
      throw new AppError(
        404,
        "User-capacity change not found.",
        {
          code: "BILLING_CAPACITY_CHANGE_NOT_FOUND",
        },
      );
    }

    if (change.status === "APPLIED") {
      return {
        outcome: "applied",
        change,
      };
    }

    const billing =
      await transaction.organizationBilling.findUnique({
        where: {
          organizationId,
        },
      });

    if (
      !billing ||
      billing.id !== change.organizationBillingId ||
      billing.stripeCustomerId !== change.stripeCustomerId ||
      billing.stripeSubscriptionId !== change.stripeSubscriptionId
    ) {
      throw changeConflict(
        "BILLING_CAPACITY_STATE_CHANGED",
        "The subscription changed. Refresh billing before continuing.",
      );
    }

    if (change.status === "PENDING_PAYMENT") {
      if (billing.activeUserCapacityChangeId !== change.id) {
        throw changeConflict(
          "BILLING_CAPACITY_RECONCILIATION_REQUIRED",
          "This user-capacity change requires reconciliation.",
        );
      }

      return {
        outcome: "pending_payment",
        change,
      };
    }

    if (change.status === "PROCESSING") {
      if (
        billing.activeUserCapacityChangeId !== change.id ||
        !change.submittedAt ||
        Date.now() - change.submittedAt.getTime() >=
          SUBMISSION_RETRY_WINDOW_MS
      ) {
        throw changeConflict(
          "BILLING_CAPACITY_RECONCILIATION_REQUIRED",
          "This user-capacity change requires reconciliation.",
        );
      }

      // Retry the same operation using its stored Stripe
      // parameters and the same idempotency key.
      return {
        outcome: "submit",
        change,
      };
    }

    if (change.status !== "QUOTED") {
      throw changeConflict(
        "BILLING_CAPACITY_PREVIEW_REQUIRED",
        "Request a new user-capacity preview before continuing.",
      );
    }

    if (change.expiresAt.getTime() <= Date.now()) {
      throw changeConflict(
        "BILLING_CAPACITY_PREVIEW_EXPIRED",
        "This preview expired. Request a new preview.",
      );
    }

    if (billing.activeUserCapacityChangeId) {
      throw changeConflict(
        "BILLING_CAPACITY_CHANGE_IN_PROGRESS",
        "Another user-capacity change is in progress.",
      );
    }

    if (
      billing.planId !== "pro" ||
      (
        billing.status !== "ACTIVE" &&
        billing.status !== "TRIALING"
      ) ||
      billing.additionalUserQuantity !==
        change.expectedAdditionalUserQuantity ||
      !sameTimestamp(
        billing.lastSyncedAt,
        change.expectedLastSyncedAt,
      )
    ) {
      throw changeConflict(
        "BILLING_CAPACITY_STATE_CHANGED",
        "Billing changed after this preview. Request a new preview.",
      );
    }

    const targetQuantity = change.targetAdditionalUserQuantity;

    if (
      !Number.isSafeInteger(targetQuantity) ||
      targetQuantity < 0 ||
      targetQuantity > 2_147_483_647
    ) {
      throw changeConflict(
        "BILLING_CAPACITY_PREVIEW_REQUIRED",
        "Request a new user-capacity preview before continuing.",
      );
    }

    const memberships = await transaction.membership.count({
      where: {
        organizationId,

        status: {
          in: ["ACTIVE", "INVITED"],
        },
      },
    });

    const pendingInvitations =
      await transaction.membershipInvitation.count({
        where: {
          organizationId,
          acceptedAt: null,
          revokedAt: null,

          expiresAt: {
            gt: new Date(),
          },
        },
      });

    if (memberships + pendingInvitations > 10 + targetQuantity) {
      throw changeConflict(
        "BILLING_CAPACITY_BELOW_USAGE",
        "Remove users or pending invitations before reducing user capacity.",
      );
    }

    await transaction.organizationBilling.update({
      where: {
        id: billing.id,
      },

      data: {
        activeUserCapacityChangeId: change.id,
      },
    });

    const claimed =
      await transaction.billingUserCapacityChange.update({
        where: {
          id: change.id,
        },

        data: {
          status: "PROCESSING",
          submittedAt: new Date(),
        },
      });

    return {
      outcome: "submit",
      change: claimed,
    };
  });
}

//************************************************************** */