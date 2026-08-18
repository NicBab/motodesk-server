import { prisma } from "../../config/prisma.js";

//************************************************************** */

export async function findActiveTechnicianAssignment(
  organizationId: string,
  repairOrderId: string,
) {
  return prisma.technicianAssignment.findFirst({
    where: {
      organizationId,
      repairOrderId,
      status: "ACTIVE",
    },
  });
}

//************************************************************** */

// export async function findTechnicianMembership(
//   organizationId: string,
//   technicianMembershipId: string,
// ) {
//   return prisma.membership.findFirst({
//     where: {
//       id: technicianMembershipId,
//       organizationId,
//       status: "ACTIVE",
//     },
//   });
// }

export async function findTechnicianMembership(
  organizationId: string,
  technicianMembershipId: string,
) {
  return prisma.membership.findFirst({
    where: {
      id:
        technicianMembershipId,

      organizationId,

      status:
        "ACTIVE",

      role: {
        in: [
          "TECHNICIAN",
          "MANAGER",
          "OWNER"
        ],
      },
    },
  });
}

//************************************************************** */

export async function assignTechnicianRecord(
  organizationId: string,
  repairOrderId: string,
  technicianMembershipId: string,
  assignedByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    const assignment = await transaction.technicianAssignment.create({
      data: {
        organizationId,
        repairOrderId,
        technicianMembershipId,
        assignedByMembershipId,
        ...(notes !== undefined
          ? {
              notes,
            }
          : {}),
      },
    });

    const repairOrderUpdate = await transaction.repairOrder.updateMany({
      where: {
        id: repairOrderId,
        organizationId,
      },

      data: {
        primaryTechnicianMembershipId: technicianMembershipId,
      },
    });

    if (repairOrderUpdate.count !== 1) {
      throw new Error(
        "Repair order technician assignment could not be applied.",
      );
    }

    return assignment;
  });
}


