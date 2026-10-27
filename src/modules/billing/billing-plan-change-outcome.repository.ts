import { prisma } from "../../config/prisma.js";

import type {
  BillingPlanChange,
  Prisma,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  lockOrganizationUserCapacity,
} from "./billing-capacity.service.js";

import {
  readBillingPlanChangeUpdateParameters,
} from "./billing-plan-change-parameters.js";

import {
  applyBillingSynchronization,
  type PreparedBillingSynchronization,
} from "./billing-sync.service.js";

//************************************************************** */

function reconciliationRequired(): AppError {
  return new AppError(
    409,
    "This plan change requires reconciliation.",
    {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    },
  );
}

//************************************************************** */

async function findLockedChange(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  changeId: string,
) {
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
    throw reconciliationRequired();
  }

  const change = await transaction.billingPlanChange.findFirst({
    where: {
      id: changeId,
      organizationBillingId: billing.id,
    },
  });

  if (!change) {
    throw new AppError(404, "Plan change not found.", {
      code: "BILLING_PLAN_CHANGE_NOT_FOUND",
    });
  }

  if (change.status !== "APPLIED") {
    if (
      billing.activePlanChangeId !== change.id ||
      billing.activeUserCapacityChangeId !== null ||
      billing.stripeCustomerId !== change.stripeCustomerId ||
      billing.stripeSubscriptionId !== change.stripeSubscriptionId
    ) {
      throw reconciliationRequired();
    }
  }

  return { billing, change };
}

//************************************************************** */

// Internal functions. Only call with verified Stripe outcomes.
// The calling service must authorize the user before submission.
//
// A delayed error must not overwrite an applied or payment-pending
// result. Uncertain outcomes retain the claim for reconciliation.

export async function recordPendingBillingPlanChange(
  organizationId: string,
  changeId: string,
  stripeInvoiceId: string,
): Promise<BillingPlanChange> {
  return prisma.$transaction(async (transaction) => {
    const { change } = await findLockedChange(
      transaction,
      organizationId,
      changeId,
    );

    if (change.status === "APPLIED") {
      return change;
    }

    if (
      !stripeInvoiceId ||
      (
        change.status !== "PROCESSING" &&
        change.status !== "PENDING_PAYMENT" &&
        change.status !== "RECONCILIATION_REQUIRED"
      ) ||
      (
        change.stripeInvoiceId !== null &&
        change.stripeInvoiceId !== stripeInvoiceId
      )
    ) {
      throw reconciliationRequired();
    }

    return transaction.billingPlanChange.update({
      where: {
        id: change.id,
      },

      data: {
        status: "PENDING_PAYMENT",
        stripeInvoiceId,
        lastErrorCode: null,
      },
    });
  });
}

//************************************************************** */

export async function recordRejectedBillingPlanChange(
  organizationId: string,
  changeId: string,
): Promise<BillingPlanChange> {
  return prisma.$transaction(async (transaction) => {
    const { billing, change } = await findLockedChange(
      transaction,
      organizationId,
      changeId,
    );

    if (
      change.status === "APPLIED" ||
      change.status === "PENDING_PAYMENT"
    ) {
      return change;
    }

    if (
      change.status !== "PROCESSING" ||
      change.stripeInvoiceId !== null
    ) {
      throw reconciliationRequired();
    }

    const rejected = await transaction.billingPlanChange.update({
      where: {
        id: change.id,
      },

      data: {
        status: "REJECTED",
        lastErrorCode: "BILLING_PLAN_CHANGE_REJECTED",
      },
    });

    await transaction.organizationBilling.update({
      where: {
        id: billing.id,
      },

      data: {
        activePlanChangeId: null,
      },
    });

    return rejected;
  });
}

//************************************************************** */

export async function recordUnconfirmedBillingPlanChange(
  organizationId: string,
  changeId: string,
): Promise<BillingPlanChange> {
  return prisma.$transaction(async (transaction) => {
    const { change } = await findLockedChange(
      transaction,
      organizationId,
      changeId,
    );

    if (
      change.status === "APPLIED" ||
      change.status === "PENDING_PAYMENT"
    ) {
      return change;
    }

    if (change.status !== "PROCESSING") {
      throw reconciliationRequired();
    }

    // Preserve the original submission timestamp, request, and
    // claim. The claim repository bounds the safe retry window.
    return transaction.billingPlanChange.update({
      where: {
        id: change.id,
      },

      data: {
        lastErrorCode: "BILLING_PLAN_CHANGE_UNCONFIRMED",
      },
    });
  });
}

//************************************************************** */

export async function applyConfirmedBillingPlanChange(
  organizationId: string,
  changeId: string,
  prepared: PreparedBillingSynchronization,
): Promise<BillingPlanChange> {
  return prisma.$transaction(async (transaction) => {
    const { billing, change } = await findLockedChange(
      transaction,
      organizationId,
      changeId,
    );

    if (change.status === "APPLIED") {
      return change;
    }

    const parameters =
      readBillingPlanChangeUpdateParameters(change);

    const targetBasePriceId = parameters.items?.[0]?.price;

    const targetAdditionalPriceId =
      change.targetAdditionalUserQuantity > 0
        ? parameters.items?.[1]?.price
        : null;

    const snapshot = prepared.snapshot;

    if (
      (
        change.status !== "PROCESSING" &&
        change.status !== "PENDING_PAYMENT" &&
        change.status !== "RECONCILIATION_REQUIRED"
      ) ||
      prepared.organizationId !== organizationId ||
      prepared.stripeCustomerId !== change.stripeCustomerId ||
      snapshot.stripeSubscriptionId !== change.stripeSubscriptionId ||
      snapshot.planId !== change.targetPlanId ||
      snapshot.stripePriceId !== targetBasePriceId ||
      snapshot.currency !== change.currency ||
      (
        snapshot.status !== "ACTIVE" &&
        snapshot.status !== "TRIALING"
      ) ||
      snapshot.additionalUserQuantity !==
        change.targetAdditionalUserQuantity
    ) {
      throw reconciliationRequired();
    }

    if (change.targetAdditionalUserQuantity > 0) {
      if (
        !targetAdditionalPriceId ||
        snapshot.stripeAdditionalUserPriceId !==
          targetAdditionalPriceId ||
        snapshot.additionalUserUnitAmount === null ||
        !snapshot.stripeAdditionalUserItemId
      ) {
        throw reconciliationRequired();
      }
    } else if (
      snapshot.additionalUserUnitAmount !== null ||
      snapshot.stripeAdditionalUserPriceId !== null ||
      snapshot.stripeAdditionalUserItemId !== null
    ) {
      throw reconciliationRequired();
    }

    const synchronizedMonthlyTotal =
      BigInt(snapshot.unitAmount) +
      BigInt(snapshot.additionalUserQuantity) *
        BigInt(snapshot.additionalUserUnitAmount ?? 0);

    if (synchronizedMonthlyTotal !== change.monthlyTotalAmount) {
      throw reconciliationRequired();
    }

    // Subscription state and operation outcome commit together.
    // A stale synchronization baseline rolls back both changes.
    await applyBillingSynchronization(
      transaction,
      prepared,
    );

    const applied = await transaction.billingPlanChange.update({
      where: {
        id: change.id,
      },

      data: {
        status: "APPLIED",
        appliedAt: new Date(),
        lastErrorCode: null,
      },
    });

    await transaction.organizationBilling.update({
      where: {
        id: billing.id,
      },

      data: {
        activePlanChangeId: null,
      },
    });

    return applied;
  });
}

//************************************************************** */