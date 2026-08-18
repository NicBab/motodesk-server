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
      id: technicianMembershipId,

      organizationId,

      status: "ACTIVE",

      role: {
        in: ["TECHNICIAN", "MANAGER", "OWNER"],
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

//************************************************************** */

export async function reassignTechnicianRecord(
  organizationId: string,
  repairOrderId: string,
  currentAssignmentId: string,
  newTechnicianMembershipId: string,
  assignedByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    const endedAt = new Date();

    // End current assignment
    await transaction.technicianAssignment.update({
      where: {
        id: currentAssignmentId,
      },

      data: {
        status: "REASSIGNED",

        endedAt,
      },
    });

    // Create new active assignment
    const newAssignment = await transaction.technicianAssignment.create({
      data: {
        organizationId,
        repairOrderId,

        technicianMembershipId: newTechnicianMembershipId,

        assignedByMembershipId,

        ...(notes !== undefined
          ? {
              notes,
            }
          : {}),
      },
    });

    // Update RO current technician pointer
    const repairOrderUpdate = await transaction.repairOrder.updateMany({
      where: {
        id: repairOrderId,

        organizationId,
      },

      data: {
        primaryTechnicianMembershipId: newTechnicianMembershipId,
      },
    });

    if (repairOrderUpdate.count !== 1) {
      throw new Error(
        "Repair order technician reassignment could not be applied.",
      );
    }

    return newAssignment;
  });
}

//************************************************************** */

export async function removeTechnicianAssignmentRecord(
  organizationId: string,
  repairOrderId: string,
  activeAssignmentId: string,
  notes: string,
) {
  return prisma.$transaction(async (transaction) => {
    const endedAt = new Date();

    //************************************************************** */
    // End active assignment

    const removedAssignment = await transaction.technicianAssignment.update({
      where: {
        id: activeAssignmentId,
      },

      data: {
        status: "REMOVED",

        endedAt,

        notes,
      },
    });

    //************************************************************** */
    // Clear RO primary technician pointer

    const repairOrderUpdate = await transaction.repairOrder.updateMany({
      where: {
        id: repairOrderId,

        organizationId,

        primaryTechnicianMembershipId: removedAssignment.technicianMembershipId,
      },

      data: {
        primaryTechnicianMembershipId: null,
      },
    });

    if (repairOrderUpdate.count !== 1) {
      throw new Error(
        "Repair order technician assignment removal could not be applied.",
      );
    }

    return removedAssignment;
  });
}
