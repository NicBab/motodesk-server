import { prisma } from "../../config/prisma.js";

import type {
  RepairOrderStatus,
} from "../../generated/prisma/client.js";

//************************************************************** */
// Reopen Repair Order

export async function reopenRepairOrderRecord(
  organizationId: string,
  repairOrderId: string,
  previousStatus: RepairOrderStatus,
  changedByMembershipId: string | null,
  notes: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      //************************************************************** */
      // Update Repair Order

      const repairOrder =
        await transaction.repairOrder.updateMany({
          where: {
            id:
              repairOrderId,

            organizationId,

            status:
              previousStatus,
          },

          data: {
            status:
              "IN_PROGRESS",
          },
        });

      if (
        repairOrder.count !==
        1
      ) {
        return null;
      }

      //************************************************************** */
      // Record Status History

      await transaction.repairOrderStatusHistory.create({
        data: {
          repairOrderId,

          status:
            "IN_PROGRESS",

          previousStatus,

          changedByMembershipId,

          notes,

          automatic:
            false,
        },
      });

      //************************************************************** */
      // Return Updated Repair Order

      return transaction.repairOrder.findFirst({
        where: {
          id:
            repairOrderId,

          organizationId,
        },
      });
    },
  );
}