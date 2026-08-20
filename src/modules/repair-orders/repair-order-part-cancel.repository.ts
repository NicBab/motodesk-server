import { prisma } from "../../config/prisma.js";

//************************************************************** */
// Cancel Proposed Repair Order Part Line

export async function cancelRepairOrderPartLineRecord(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  cancelledByMembershipId: string | null,
  reason: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      //************************************************************** */
      // Cancel Eligible Proposed Part

      const cancelledPart =
        await transaction.repairOrderPartLine.updateMany({
          where: {
            id:
              partLineId,

            repairOrderId,

            status: {
              in: [
                "NEEDS_REVIEW",
                "TO_BE_ORDERED",
              ],
            },
          },

          data: {
            status:
              "CANCELLED",

            blocksWork:
              false,
          },
        });

      if (
        cancelledPart.count !==
        1
      ) {
        return null;
      }

      //************************************************************** */
      // Persist Cancellation Audit
      //
      // For now, store the audit on the part-line notes/history path
      // only if your current model already supports one.
      //
      // We are deliberately not inventing a new audit model here yet.

      void cancelledByMembershipId;
      void reason;

      //************************************************************** */
      // Return Updated Part Line

      return transaction.repairOrderPartLine.findFirst({
        where: {
          id:
            partLineId,

          repairOrderId,
        },
      });
    },
  );
}