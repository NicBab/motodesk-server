import { prisma } from "../../config/prisma.js";

import type { RepairOrderStatus } from "../../generated/prisma/client.js";

//************************************************************** */
// Request Additional Work Approval

export async function requestAdditionalWorkApprovalRecord(
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
        status: "WAITING_ON_ADDITIONAL_APPROVAL",
      },
    });

    if (repairOrderUpdate.count !== 1) {
      return null;
    }

    await transaction.repairOrderStatusHistory.create({
      data: {
        repairOrderId,

        previousStatus,

        status: "WAITING_ON_ADDITIONAL_APPROVAL",

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

//************************************************************** */
// Approve Additional Work

export async function approveAdditionalWorkRecord(
  organizationId: string,
  repairOrderId: string,
  nextStatus:
    | "IN_PROGRESS"
    | "PARTS_REVIEW",
  changedByMembershipId: string | null,
  approvedBy: string,
  approvalMethod: string,
  approvedAmount?: number,
  notes?: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const repairOrderUpdate =
        await transaction.repairOrder.updateMany({
          where: {
            id:
              repairOrderId,

            organizationId,

            status:
              "WAITING_ON_ADDITIONAL_APPROVAL",
          },

          data: {
            status:
              nextStatus,
          },
        });

      if (
        repairOrderUpdate.count !==
        1
      ) {
        return null;
      }

      await transaction.repairOrderStatusHistory.create({
        data: {
          repairOrderId,

          previousStatus:
            "WAITING_ON_ADDITIONAL_APPROVAL",

          status:
            nextStatus,

          changedByMembershipId,

          notes:
            notes ??
            `Additional work approved by ${approvedBy} via ${approvalMethod}${
              approvedAmount !== undefined
                ? ` for ${approvedAmount}`
                : ""
            }.`,

          automatic:
            false,
        },
      });

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

//************************************************************** */
// Decline Additional Work

export async function declineAdditionalWorkRecord(
  organizationId: string,
  repairOrderId: string,
  changedByMembershipId: string | null,
  notes: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const repairOrderUpdate =
        await transaction.repairOrder.updateMany({
          where: {
            id:
              repairOrderId,

            organizationId,

            status:
              "WAITING_ON_ADDITIONAL_APPROVAL",
          },

          data: {
            status:
              "IN_PROGRESS",
          },
        });

      if (
        repairOrderUpdate.count !==
        1
      ) {
        return null;
      }

      await transaction.repairOrderStatusHistory.create({
        data: {
          repairOrderId,

          previousStatus:
            "WAITING_ON_ADDITIONAL_APPROVAL",

          status:
            "IN_PROGRESS",

          changedByMembershipId,

          notes,

          automatic:
            false,
        },
      });

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
