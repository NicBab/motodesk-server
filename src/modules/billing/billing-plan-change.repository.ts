import { prisma } from "../../config/prisma.js";

import type {
  BillingPlanChange,
  OrganizationBilling,
  Prisma,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import { lockOrganizationUserCapacity } from "./billing-capacity.service.js";

import { getBillingPlan, isBillingPlanId } from "./billing.constants.js";

//************************************************************** */

const SUBMISSION_RETRY_WINDOW_MS = 23 * 60 * 60 * 1_000;

export interface BillingPlanChangePreviewData {
  organizationBillingId: string;

  stripeCustomerId: string;
  stripeSubscriptionId: string;
  expectedStripePriceId: string;

  expectedPlanId: string;
  targetPlanId: string;

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

export interface ClaimedBillingPlanChange {
  outcome: "submit" | "pending_payment" | "applied";
  change: BillingPlanChange;
}

//************************************************************** */

function conflict(code: string, message: string): AppError {
  return new AppError(409, message, { code });
}

function previewRequired(): AppError {
  return conflict(
    "BILLING_PLAN_PREVIEW_REQUIRED",
    "Request a new plan-change preview before continuing.",
  );
}

function reconciliationRequired(): AppError {
  return conflict(
    "BILLING_PLAN_RECONCILIATION_REQUIRED",
    "This plan change requires reconciliation.",
  );
}

function isValidQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
}

//************************************************************** */

type PlanChangeTerms = Pick<
  BillingPlanChangePreviewData,
  | "expectedPlanId"
  | "targetPlanId"
  | "expectedAdditionalUserQuantity"
  | "targetAdditionalUserQuantity"
  | "currency"
  | "estimatedAmountDue"
  | "monthlyTotalAmount"
>;

function validateTerms(change: PlanChangeTerms): number {
  if (
    !isBillingPlanId(change.expectedPlanId) ||
    !isBillingPlanId(change.targetPlanId) ||
    change.expectedPlanId === change.targetPlanId ||
    !isValidQuantity(change.expectedAdditionalUserQuantity) ||
    !isValidQuantity(change.targetAdditionalUserQuantity) ||
    (change.expectedPlanId !== "pro" &&
      change.expectedAdditionalUserQuantity !== 0) ||
    (change.targetPlanId !== "pro" && change.targetAdditionalUserQuantity !== 0)
  ) {
    throw previewRequired();
  }

  const targetPlan = getBillingPlan(change.targetPlanId);

  const additionalUnitAmount =
    targetPlan.additionalUserPricing?.unitAmount ?? 0;

  const monthlyTotalAmount =
    BigInt(targetPlan.unitAmount) +
    BigInt(change.targetAdditionalUserQuantity) * BigInt(additionalUnitAmount);

  if (
    change.currency !== targetPlan.currency ||
    change.estimatedAmountDue < 0n ||
    change.estimatedAmountDue > BigInt(Number.MAX_SAFE_INTEGER) ||
    change.monthlyTotalAmount !== monthlyTotalAmount ||
    monthlyTotalAmount > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw previewRequired();
  }

  return targetPlan.usersIncluded + change.targetAdditionalUserQuantity;
}

//************************************************************** */

function assertExpectedBilling(
  billing: OrganizationBilling,
  expected: Pick<
    BillingPlanChangePreviewData,
    | "organizationBillingId"
    | "stripeCustomerId"
    | "stripeSubscriptionId"
    | "expectedStripePriceId"
    | "expectedPlanId"
    | "expectedAdditionalUserQuantity"
    | "expectedLastSyncedAt"
  >,
): void {
  if (
    billing.id !== expected.organizationBillingId ||
    billing.stripeCustomerId !== expected.stripeCustomerId ||
    billing.stripeSubscriptionId !== expected.stripeSubscriptionId ||
    billing.stripePriceId !== expected.expectedStripePriceId ||
    billing.planId !== expected.expectedPlanId ||
    billing.additionalUserQuantity !==
      expected.expectedAdditionalUserQuantity ||
    billing.lastSyncedAt?.getTime() !==
      expected.expectedLastSyncedAt?.getTime() ||
    (billing.status !== "ACTIVE" && billing.status !== "TRIALING")
  ) {
    throw conflict(
      "BILLING_PLAN_STATE_CHANGED",
      "Billing changed after this preview. Refresh and request a new preview.",
    );
  }

  if (billing.cancelAtPeriodEnd || billing.cancelAt !== null) {
    throw conflict(
      "BILLING_CANCELLATION_SCHEDULED",
      "Undo the scheduled cancellation before changing plans.",
    );
  }
}

async function assertActiveOrganization(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const organization = await transaction.organization.findUnique({
    where: {
      id: organizationId,
    },

    select: {
      status: true,
    },
  });

  if (organization?.status !== "ACTIVE") {
    throw new AppError(404, "Organization not found.", {
      code: "ORGANIZATION_NOT_FOUND",
    });
  }
}

function assertNoActiveChange(billing: OrganizationBilling): void {
  if (billing.activePlanChangeId || billing.activeUserCapacityChangeId) {
    throw conflict(
      "BILLING_SUBSCRIPTION_CHANGE_PENDING",
      "Resolve the existing billing change before continuing.",
    );
  }
}

//************************************************************** */

// Internal persistence functions, not authorization checks.
// Services must authorize BILLING_UPDATE before calling them.

export async function findBillingPlanChange(
  organizationId: string,
  requestedByUserId: string,
  changeId: string,
): Promise<BillingPlanChange | null> {
  return prisma.billingPlanChange.findFirst({
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

export async function createBillingPlanChangePreview(
  organizationId: string,
  requestedByUserId: string,
  preview: BillingPlanChangePreviewData,
): Promise<BillingPlanChange> {
  validateTerms(preview);

  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(transaction, organizationId);

    await assertActiveOrganization(transaction, organizationId);

    const billing = await transaction.organizationBilling.findUnique({
      where: {
        organizationId,
      },
    });

    if (!billing) {
      throw conflict(
        "BILLING_PLAN_STATE_CHANGED",
        "The subscription changed. Refresh billing before continuing.",
      );
    }

    assertExpectedBilling(billing, preview);
    assertNoActiveChange(billing);

    if (
      !Number.isFinite(preview.expiresAt.getTime()) ||
      preview.expiresAt.getTime() <= Date.now()
    ) {
      throw conflict(
        "BILLING_PLAN_PREVIEW_EXPIRED",
        "This preview expired. Request a new preview.",
      );
    }

    return transaction.billingPlanChange.create({
      data: {
        ...preview,
        requestedByUserId,
      },
    });
  });
}

//************************************************************** */

export async function claimBillingPlanChange(
  organizationId: string,
  requestedByUserId: string,
  changeId: string,
): Promise<ClaimedBillingPlanChange> {
  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(transaction, organizationId);

    await assertActiveOrganization(transaction, organizationId);

    const change = await transaction.billingPlanChange.findFirst({
      where: {
        id: changeId,
        requestedByUserId,

        organizationBilling: {
          organizationId,
        },
      },
    });

    if (!change) {
      throw new AppError(404, "Plan change not found.", {
        code: "BILLING_PLAN_CHANGE_NOT_FOUND",
      });
    }

    const targetUserLimit = validateTerms(change);

    if (change.status === "APPLIED") {
      return {
        outcome: "applied",
        change,
      };
    }

    const billing = await transaction.organizationBilling.findUnique({
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
      throw conflict(
        "BILLING_PLAN_STATE_CHANGED",
        "The subscription changed. Refresh billing before continuing.",
      );
    }

    if (change.status === "PROCESSING" || change.status === "PENDING_PAYMENT") {
      if (
        billing.activePlanChangeId !== change.id ||
        billing.activeUserCapacityChangeId !== null
      ) {
        throw reconciliationRequired();
      }

      if (change.status === "PENDING_PAYMENT") {
        return {
          outcome: "pending_payment",
          change,
        };
      }

      const submittedAt = change.submittedAt?.getTime();

      if (
        submittedAt === undefined ||
        !Number.isFinite(submittedAt) ||
        submittedAt > Date.now() ||
        Date.now() - submittedAt >= SUBMISSION_RETRY_WINDOW_MS
      ) {
        throw reconciliationRequired();
      }

      // A retry must use this record's immutable parameters and
      // the same operation-specific Stripe idempotency key.
      return {
        outcome: "submit",
        change,
      };
    }

    if (change.status !== "QUOTED") {
      throw previewRequired();
    }

    if (change.expiresAt.getTime() <= Date.now()) {
      throw conflict(
        "BILLING_PLAN_PREVIEW_EXPIRED",
        "This preview expired. Request a new preview.",
      );
    }

    assertNoActiveChange(billing);
    assertExpectedBilling(billing, change);

    const memberships = await transaction.membership.count({
      where: {
        organizationId,

        status: {
          in: ["ACTIVE", "INVITED"],
        },
      },
    });

    const pendingInvitations = await transaction.membershipInvitation.count({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,

        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (memberships + pendingInvitations > targetUserLimit) {
      throw conflict(
        "BILLING_PLAN_CAPACITY_BELOW_USAGE",
        "Remove users or pending invitations before selecting this plan.",
      );
    }

    await transaction.organizationBilling.update({
      where: {
        id: billing.id,
      },

      data: {
        activePlanChangeId: change.id,
      },
    });

    const claimed = await transaction.billingPlanChange.update({
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
