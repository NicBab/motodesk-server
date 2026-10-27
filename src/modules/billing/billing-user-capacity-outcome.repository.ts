import { prisma } from "../../config/prisma.js";

import type {
  Prisma,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  lockOrganizationUserCapacity,
} from "./billing-capacity.service.js";

import {
  applyBillingSynchronization,
  type PreparedBillingSynchronization,
} from "./billing-sync.service.js";

//************************************************************** */

function reconciliationRequired(): AppError {
  return new AppError(
    409,
    "This user-capacity change requires reconciliation.",
    {
      code: "BILLING_CAPACITY_RECONCILIATION_REQUIRED",
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

  const change =
    await transaction.billingUserCapacityChange.findFirst({
      where: {
        id: changeId,
        organizationBillingId: billing.id,
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

  if (change.status !== "APPLIED") {
    if (
      billing.activeUserCapacityChangeId !== change.id ||
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
// No Stripe network requests run inside these transactions.

export async function recordPendingBillingUserCapacityChange(
  organizationId: string,
  changeId: string,
  stripeInvoiceId: string,
) {
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

    return transaction.billingUserCapacityChange.update({
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

export async function recordRejectedBillingUserCapacityChange(
  organizationId: string,
  changeId: string,
) {
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
      // A delayed error must not overwrite a more advanced outcome.
      return change;
    }

    if (
      change.status !== "PROCESSING" ||
      change.stripeInvoiceId !== null
    ) {
      throw reconciliationRequired();
    }

    const rejected =
      await transaction.billingUserCapacityChange.update({
        where: {
          id: change.id,
        },

        data: {
          status: "REJECTED",
          lastErrorCode: "BILLING_CAPACITY_CHANGE_REJECTED",
        },
      });

    await transaction.organizationBilling.update({
      where: {
        id: billing.id,
      },

      data: {
        activeUserCapacityChangeId: null,
      },
    });

    return rejected;
  });
}

//************************************************************** */

export async function recordUnconfirmedBillingUserCapacityChange(
  organizationId: string,
  changeId: string,
) {
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

    // Keep PROCESSING and submittedAt intact. A safe retry must
    // reuse the same operation, parameters, and idempotency key.
    // The claim repository enforces the bounded retry window.
    return transaction.billingUserCapacityChange.update({
      where: {
        id: change.id,
      },

      data: {
        lastErrorCode: "BILLING_CAPACITY_CHANGE_UNCONFIRMED",
      },
    });
  });
}

//************************************************************** */

export async function applyConfirmedBillingUserCapacityChange(
  organizationId: string,
  changeId: string,
  prepared: PreparedBillingSynchronization,
) {
  return prisma.$transaction(async (transaction) => {
    const { billing, change } = await findLockedChange(
      transaction,
      organizationId,
      changeId,
    );

    if (change.status === "APPLIED") {
      return change;
    }

    if (
      (
        change.status !== "PROCESSING" &&
        change.status !== "PENDING_PAYMENT" &&
        change.status !== "RECONCILIATION_REQUIRED"
      ) ||
      prepared.organizationId !== organizationId ||
      prepared.stripeCustomerId !== change.stripeCustomerId ||
      prepared.snapshot.stripeSubscriptionId !==
        change.stripeSubscriptionId ||
      prepared.snapshot.planId !== "pro" ||
      (
        prepared.snapshot.status !== "ACTIVE" &&
        prepared.snapshot.status !== "TRIALING"
      ) ||
      prepared.snapshot.additionalUserQuantity !==
        change.targetAdditionalUserQuantity
    ) {
      throw reconciliationRequired();
    }

    // Uses the existing compare-and-set synchronization marker.
    // A stale snapshot rolls back this entire transaction.
    await applyBillingSynchronization(
      transaction,
      prepared,
    );

    const applied =
      await transaction.billingUserCapacityChange.update({
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
        activeUserCapacityChangeId: null,
      },
    });

    return applied;
  });
}

//************************************************************** */