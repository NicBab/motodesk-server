import { prisma } from "../../config/prisma.js";

//************************************************************** */
// Cancel Proposed Repair Order Labor Line

export async function cancelRepairOrderLaborLineRecord(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
  cancelledByMembershipId: string | null,
  reason: string,
) {
  return prisma.$transaction(async (transaction) => {
    //************************************************************** */
    // Cancel Proposed Labor

    const cancelledLabor = await transaction.repairOrderLaborLine.updateMany({
      where: {
        id: laborLineId,

        repairOrderId,

        status: "PROPOSED",

        startedAt: null,

        completed: false,
      },

      data: {
        status: "CANCELLED",
      },
    });

    if (cancelledLabor.count !== 1) {
      return null;
    }

    //************************************************************** */
    // Persist Cancellation Audit

    await transaction.repairOrderLaborCancellation.create({
      data: {
        organizationId,
        repairOrderId,
        laborLineId,

        cancelledByMembershipId,

        reason,
      },
    });

    //************************************************************** */
    // Return Updated Labor Line

    return transaction.repairOrderLaborLine.findFirst({
      where: {
        id: laborLineId,

        repairOrderId,
      },

      include: {
        technician: {
          include: {
            user: true,
          },
        },

        cancellations: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });
  });
}
