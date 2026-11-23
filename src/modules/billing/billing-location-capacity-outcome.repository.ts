
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
    "This location-capacity change requires reconciliation.",
    {
      code: "BILLING_LOCATION_RECONCILIATION_REQUIRED",
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
    await transaction.billingLocationCapacityChange.findFirst({
      where: {
        id: changeId,
        organizationBillingId: billing.id,
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

  if (change.status !== "APPLIED") {
    if (
      billing.activeLocationCapacityChangeId !== change.id ||
      billing.stripeCustomerId !== change.stripeCustomerId ||
      billing.stripeSubscriptionId !== change.stripeSubscriptionId
    ) {
      throw reconciliationRequired();
    }
  }

  return { billing, change };
}

//************************************************************** */

// Internal operations only. Call after verifying the Stripe outcome.
// No external Stripe requests are made inside database transactions.

export async function recordPendingBillingLocationCapacityChange(
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

    return transaction.billingLocationCapacityChange.update({
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

export async function recordRejectedBillingLocationCapacityChange(
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
      return change;
    }

    if (
      change.status !== "PROCESSING" ||
      change.stripeInvoiceId !== null
    ) {
      throw reconciliationRequired();
    }

    const rejected =
      await transaction.billingLocationCapacityChange.update({
        where: {
          id: change.id,
        },
        data: {
          status: "REJECTED",
          lastErrorCode: "BILLING_LOCATION_CHANGE_REJECTED",
        },
      });

    await transaction.organizationBilling.update({
      where: {
        id: billing.id,
      },
      data: {
        activeLocationCapacityChangeId: null,
      },
    });

    return rejected;
  });
}

//************************************************************** */

export async function recordUnconfirmedBillingLocationCapacityChange(
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

    // Preserve the submission timestamp and processing state.
    // Retries must reuse the same Stripe idempotency key.
    return transaction.billingLocationCapacityChange.update({
      where: {
        id: change.id,
      },
      data: {
        lastErrorCode: "BILLING_LOCATION_CHANGE_UNCONFIRMED",
      },
    });
  });
}

//************************************************************** */

export async function applyConfirmedBillingLocationCapacityChange(
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
      prepared.snapshot.additionalLocationQuantity !==
        change.targetAdditionalLocationQuantity
    ) {
      throw reconciliationRequired();
    }

    // The billing sync performs the existing compare-and-set
    // verification. Any stale snapshot rolls back the transaction.
    await applyBillingSynchronization(
      transaction,
      prepared,
    );

    const applied =
      await transaction.billingLocationCapacityChange.update({
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
        activeLocationCapacityChangeId: null,
      },
    });

    return applied;
  });
}

//************************************************************** */
