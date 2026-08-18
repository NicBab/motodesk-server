import { prisma } from "../../config/prisma.js";

//************************************************************** */
// Create Service Bay

export async function createServiceBayRecord(
  organizationId: string,
  name: string,
  description?: string,
) {
  return prisma.serviceBay.create({
    data: {
      organizationId,
      name,

      ...(description !== undefined
        ? {
            description,
          }
        : {}),
    },
  });
}

//************************************************************** */
// Find Service Bay

export async function findServiceBayById(
  organizationId: string,
  serviceBayId: string,
) {
  return prisma.serviceBay.findFirst({
    where: {
      id: serviceBayId,

      organizationId,
    },
  });
}

//************************************************************** */
// Find Service Bay By Name

export async function findServiceBayByName(
  organizationId: string,
  name: string,
) {
  return prisma.serviceBay.findFirst({
    where: {
      organizationId,
      name,
    },
  });
}

//************************************************************** */
// List Service Bays

export async function listServiceBayRecords(organizationId: string) {
  return prisma.serviceBay.findMany({
    where: {
      organizationId,
    },

    orderBy: {
      name: "asc",
    },
  });
}

//************************************************************** */
// Find Active Assignment For Repair Order

export async function findActiveServiceBayAssignmentForRepairOrder(
  organizationId: string,
  repairOrderId: string,
) {
  return prisma.serviceBayAssignment.findFirst({
    where: {
      organizationId,
      repairOrderId,
      status: "ACTIVE",
    },
  });
}

//************************************************************** */
// Find Active Assignment For Service Bay

export async function findActiveServiceBayAssignmentForBay(
  organizationId: string,
  serviceBayId: string,
) {
  return prisma.serviceBayAssignment.findFirst({
    where: {
      organizationId,
      serviceBayId,
      status: "ACTIVE",
    },
  });
}

//************************************************************** */
// Assign Repair Order To Service Bay

export async function assignRepairOrderToServiceBayRecord(
  organizationId: string,
  repairOrderId: string,
  serviceBayId: string,
  assignedByMembershipId: string | null,
  notes?: string,
) {
  return prisma.serviceBayAssignment.create({
    data: {
      organizationId,
      repairOrderId,
      serviceBayId,
      assignedByMembershipId,

      ...(notes !== undefined
        ? {
            notes,
          }
        : {}),
    },
  });
}

//************************************************************** */
// Release Repair Order From Service Bay

export async function releaseRepairOrderFromServiceBayRecord(
  organizationId: string,
  repairOrderId: string,
  activeAssignmentId: string,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    //************************************************************** */
    // Release Active Assignment

    const releasedAssignment =
      await transaction.serviceBayAssignment.updateMany({
        where: {
          id: activeAssignmentId,

          organizationId,

          repairOrderId,

          status: "ACTIVE",
        },

        data: {
          status: "RELEASED",

          releasedAt: new Date(),

          ...(notes !== undefined
            ? {
                notes,
              }
            : {}),
        },
      });

    if (releasedAssignment.count !== 1) {
      return null;
    }

    //************************************************************** */
    // Return Updated Assignment

    return transaction.serviceBayAssignment.findUnique({
      where: {
        id: activeAssignmentId,
      },
    });
  });
}

//************************************************************** */
// Update Service Bay Status

export async function updateServiceBayStatusRecord(
  organizationId: string,
  serviceBayId: string,
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE",
) {
  const result = await prisma.serviceBay.updateMany({
    where: {
      id: serviceBayId,

      organizationId,
    },

    data: {
      status,
    },
  });

  if (result.count !== 1) {
    return null;
  }

  return prisma.serviceBay.findFirst({
    where: {
      id: serviceBayId,

      organizationId,
    },
  });
}
