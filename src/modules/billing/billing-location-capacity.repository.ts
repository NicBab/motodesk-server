
import { prisma } from "../../config/prisma.js";

import type {
  BillingLocationCapacityChange,
  Prisma,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  lockOrganizationUserCapacity,
} from "./billing-capacity.service.js";

//************************************************************** */

const SUBMISSION_RETRY_WINDOW_MS = 23 * 60 * 60 * 1_000;

export interface BillingLocationCapacityPreviewData {
  organizationBillingId: string;

  stripeCustomerId: string;
  stripeSubscriptionId: string;

  expectedAdditionalLocationQuantity: number;
  targetAdditionalLocationQuantity: number;

  expectedLastSyncedAt: Date | null;

  prorationDate: number;
  currency: string;

  estimatedAmountDue: bigint;
  monthlyTotalAmount: bigint;

  stripeUpdateParameters: Prisma.InputJsonObject;

  expiresAt: Date;
}

export interface ClaimedBillingLocationCapacityChange {
  outcome: "submit" | "pending_payment" | "applied";
  change: BillingLocationCapacityChange;
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

function assertNoConflictingChange(
  billing: {
    activePlanChangeId: string | null;
    activeUserCapacityChangeId: string | null;
  },
): void {
  if (
    billing.activePlanChangeId ||
    billing.activeUserCapacityChangeId
  ) {
    throw changeConflict(
      "BILLING_SUBSCRIPTION_CHANGE_PENDING",
      "Resolve the existing subscription change before changing location capacity.",
    );
  }
}

//************************************************************** */

export async function findBillingLocationCapacityChange(
  organizationId: string,
  requestedByUserId: string,
  changeId: string,
) {
  return prisma.billingLocationCapacityChange.findFirst({
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

export async function createBillingLocationCapacityPreview(
  organizationId: string,
  requestedByUserId: string,
  preview: BillingLocationCapacityPreviewData,
): Promise<BillingLocationCapacityChange> {
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
      billing.stripeSubscriptionId !== preview.stripeSubscriptionId ||
      billing.additionalLocationQuantity !==
        preview.expectedAdditionalLocationQuantity ||
      !sameTimestamp(
        billing.lastSyncedAt,
        preview.expectedLastSyncedAt,
      )
    ) {
      throw changeConflict(
        "BILLING_LOCATION_STATE_CHANGED",
        "Billing changed while preparing this preview.",
      );
    }

    assertNoConflictingChange(billing);

    if (billing.activeLocationCapacityChangeId) {
      throw changeConflict(
        "BILLING_LOCATION_CHANGE_IN_PROGRESS",
        "Another location-capacity change is in progress.",
      );
    }

    if (preview.expiresAt.getTime() <= Date.now()) {
      throw changeConflict(
        "BILLING_LOCATION_PREVIEW_EXPIRED",
        "This preview expired. Request a new preview.",
      );
    }

    return transaction.billingLocationCapacityChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId,

        stripeCustomerId: preview.stripeCustomerId,
        stripeSubscriptionId: preview.stripeSubscriptionId,

        expectedAdditionalLocationQuantity:
          preview.expectedAdditionalLocationQuantity,

        targetAdditionalLocationQuantity:
          preview.targetAdditionalLocationQuantity,

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

export async function claimBillingLocationCapacityChange(
  organizationId: string,
  requestedByUserId: string,
  changeId: string,
): Promise<ClaimedBillingLocationCapacityChange> {
  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const change =
      await transaction.billingLocationCapacityChange.findFirst({
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
        "Location-capacity change not found.",
        {
          code: "BILLING_LOCATION_CHANGE_NOT_FOUND",
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
        "BILLING_LOCATION_STATE_CHANGED",
        "The subscription changed. Refresh billing.",
      );
    }

    assertNoConflictingChange(billing);

    if (change.status === "PENDING_PAYMENT") {
      if (billing.activeLocationCapacityChangeId !== change.id) {
        throw changeConflict(
          "BILLING_LOCATION_RECONCILIATION_REQUIRED",
          "This location purchase requires reconciliation.",
        );
      }

      return {
        outcome: "pending_payment",
        change,
      };
    }

    if (change.status === "PROCESSING") {
      if (
        billing.activeLocationCapacityChangeId !== change.id ||
        !change.submittedAt ||
        Date.now() - change.submittedAt.getTime() >=
          SUBMISSION_RETRY_WINDOW_MS
      ) {
        throw changeConflict(
          "BILLING_LOCATION_RECONCILIATION_REQUIRED",
          "This location purchase requires reconciliation.",
        );
      }

      return {
        outcome: "submit",
        change,
      };
    }

    if (change.status !== "QUOTED") {
      throw changeConflict(
        "BILLING_LOCATION_PREVIEW_REQUIRED",
        "Request a new location-capacity preview.",
      );
    }

    if (change.expiresAt.getTime() <= Date.now()) {
      throw changeConflict(
        "BILLING_LOCATION_PREVIEW_EXPIRED",
        "This preview has expired.",
      );
    }

    if (billing.activeLocationCapacityChangeId) {
      throw changeConflict(
        "BILLING_LOCATION_CHANGE_IN_PROGRESS",
        "Another location-capacity change is in progress.",
      );
    }

    if (
      billing.planId !== "pro" ||
      (
        billing.status !== "ACTIVE" &&
        billing.status !== "TRIALING"
      ) ||
      billing.additionalLocationQuantity !==
        change.expectedAdditionalLocationQuantity ||
      !sameTimestamp(
        billing.lastSyncedAt,
        change.expectedLastSyncedAt,
      )
    ) {
      throw changeConflict(
        "BILLING_LOCATION_STATE_CHANGED",
        "Billing changed after this preview.",
      );
    }

    const targetQuantity =
      change.targetAdditionalLocationQuantity;

    if (
      !Number.isSafeInteger(targetQuantity) ||
      targetQuantity < 0 ||
      targetQuantity > 2_147_483_647 ||
      targetQuantity === change.expectedAdditionalLocationQuantity
    ) {
      throw changeConflict(
        "BILLING_LOCATION_PREVIEW_REQUIRED",
        "Request a valid location-capacity preview.",
      );
    }

    const activeLocations =
      await transaction.shopLocation.count({
        where: {
          organizationId,
          status: "ACTIVE",
        },
      });

    if (activeLocations > 2 + targetQuantity) {
      throw changeConflict(
        "BILLING_LOCATION_CAPACITY_BELOW_USAGE",
        "Archive locations before reducing purchased capacity.",
      );
    }

    await transaction.organizationBilling.update({
      where: {
        id: billing.id,
      },
      data: {
        activeLocationCapacityChangeId: change.id,
      },
    });

    const claimed =
      await transaction.billingLocationCapacityChange.update({
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
