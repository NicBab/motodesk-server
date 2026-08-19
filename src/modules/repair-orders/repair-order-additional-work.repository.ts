import { prisma } from "../../config/prisma.js";

import type { RepairOrderStatus } from "../../generated/prisma/client.js";

//************************************************************** */
// Send Additional Work To Parts Review

export async function sendAdditionalWorkToPartsReviewRecord(
  organizationId: string,
  repairOrderId: string,
  previousStatus: RepairOrderStatus,
  changedByMembershipId: string | null,
  notes: string,
) {
  return prisma.$transaction(async (transaction) => {
    const repairOrderUpdate = await transaction.repairOrder.updateMany({
      where: {
        id: repairOrderId,

        organizationId,

        status: previousStatus,
      },

      data: {
        status: "PARTS_REVIEW",
      },
    });

    if (repairOrderUpdate.count !== 1) {
      return null;
    }

    await transaction.repairOrderStatusHistory.create({
      data: {
        repairOrderId,

        previousStatus,

        status: "PARTS_REVIEW",

        changedByMembershipId,

        notes,

        automatic: false,
      },
    });

    return transaction.repairOrder.findFirst({
      where: {
        id: repairOrderId,

        organizationId,
      },
    });
  });
}
