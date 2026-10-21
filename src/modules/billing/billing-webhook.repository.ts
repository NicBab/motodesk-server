import { randomUUID } from "node:crypto";

import { prisma } from "../../config/prisma.js";

import type {
  Prisma,
} from "../../generated/prisma/client.js";

//************************************************************** */

const PROCESSING_LEASE_MILLISECONDS = 5 * 60 * 1_000;

export interface BillingWebhookRecordInput {
  id: string;
  type: string;
  livemode: boolean;
  eventCreatedAt: Date;
  stripeObjectId: string | null;
}

export type BillingWebhookClaim =
  | {
      status: "claimed";
      processingToken: string;
    }
  | {
      status: "processed";
    }
  | {
      status: "busy";
    };

//************************************************************** */

export async function claimBillingWebhookEvent(
  input: BillingWebhookRecordInput,
): Promise<BillingWebhookClaim> {
  // The primary key prevents duplicate event records.
  // Existing processing state is never overwritten.
  await prisma.stripeWebhookEvent.createMany({
    data: [
      {
        id: input.id,
        type: input.type,
        livemode: input.livemode,
        eventCreatedAt: input.eventCreatedAt,
        stripeObjectId: input.stripeObjectId,
      },
    ],

    skipDuplicates: true,
  });

  const now = new Date();
  const processingToken = randomUUID();

  const result = await prisma.stripeWebhookEvent.updateMany({
    where: {
      id: input.id,

      type: input.type,
      livemode: input.livemode,
      eventCreatedAt: input.eventCreatedAt,
      stripeObjectId: input.stripeObjectId,

      processedAt: null,

      OR: [
        {
          processingLeaseUntil: null,
        },
        {
          processingLeaseUntil: {
            lte: now,
          },
        },
      ],
    },

    data: {
      processingToken,

      processingLeaseUntil: new Date(
        now.getTime() + PROCESSING_LEASE_MILLISECONDS,
      ),

      attemptCount: {
        increment: 1,
      },

      lastErrorCode: null,
    },
  });

  if (result.count === 1) {
    return {
      status: "claimed",
      processingToken,
    };
  }

  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: {
      id: input.id,
    },

    select: {
      type: true,
      livemode: true,
      eventCreatedAt: true,
      stripeObjectId: true,
      processedAt: true,
    },
  });

  const sameEvent =
    existing !== null &&
    existing.type === input.type &&
    existing.livemode === input.livemode &&
    existing.eventCreatedAt.getTime() ===
      input.eventCreatedAt.getTime() &&
    existing.stripeObjectId === input.stripeObjectId;

  if (sameEvent && existing.processedAt !== null) {
    return {
      status: "processed",
    };
  }

  return {
    status: "busy",
  };
}

//************************************************************** */

export async function completeBillingWebhookEvent(
  eventId: string,
  processingToken: string,
  applyBillingChanges: (
    transaction: Prisma.TransactionClient,
  ) => Promise<void>,
): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    const now = new Date();

    // Fence out workers whose claim expired or was replaced.
    // This update and the billing changes commit together.
    const result = await transaction.stripeWebhookEvent.updateMany({
      where: {
        id: eventId,
        processingToken,
        processedAt: null,

        processingLeaseUntil: {
          gt: now,
        },
      },

      data: {
        processedAt: now,
        processingToken: null,
        processingLeaseUntil: null,
        lastErrorCode: null,
      },
    });

    if (result.count !== 1) {
      return false;
    }

    // Database changes only. Fetch Stripe state before entering
    // this transaction so network calls do not hold database locks.
    await applyBillingChanges(transaction);

    return true;
  });
}

//************************************************************** */

export async function releaseFailedBillingWebhookEvent(
  eventId: string,
  processingToken: string,
): Promise<void> {
  await prisma.stripeWebhookEvent.updateMany({
    where: {
      id: eventId,
      processingToken,
      processedAt: null,
    },

    data: {
      processingToken: null,
      processingLeaseUntil: null,
      lastErrorCode: "BILLING_WEBHOOK_PROCESSING_FAILED",
    },
  });
}

//************************************************************** */