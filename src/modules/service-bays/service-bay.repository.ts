
import { prisma } from "../../config/prisma.js";

//************************************************************** */
// Create Service Bay

export async function createServiceBayRecord(
  organizationId: string,
  shopLocationId: string,
  name: string,
  description?: string,
) {
  return prisma.serviceBay.create({
    data: {
      organizationId,
      shopLocationId,
      name,

      ...(description !== undefined
        ? { description }
        : {}),
    },
  });
}

//************************************************************** */
// Find Service Bay

export async function findServiceBayById(
  organizationId: string,
  shopLocationId: string,
  serviceBayId: string,
) {
  return prisma.serviceBay.findFirst({
    where: {
      id: serviceBayId,
      organizationId,
      shopLocationId,
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

export async function listServiceBayRecords(
  organizationId: string,
  shopLocationId: string,
) {
  return prisma.serviceBay.findMany({
    where: {
      organizationId,
      shopLocationId,
    },

    orderBy: {
      name: "asc",
    },
  });
}

//************************************************************** */
// Verify Repair Order Location

export async function findRepairOrderForServiceBay(
  organizationId: string,
  shopLocationId: string,
  repairOrderId: string,
) {
  return prisma.repairOrder.findFirst({
    where: {
      id: repairOrderId,
      organizationId,
      shopLocationId,
    },

    select: {
      id: true,
    },
  });
}

//************************************************************** */
// Find Active Assignment For Repair Order

export async function findActiveServiceBayAssignmentForRepairOrder(
  organizationId: string,
  shopLocationId: string,
  repairOrderId: string,
) {
  return prisma.serviceBayAssignment.findFirst({
    where: {
      organizationId,
      repairOrderId,
      status: "ACTIVE",

      repairOrder: {
        organizationId,
        shopLocationId,
      },

      serviceBay: {
        organizationId,
        shopLocationId,
      },
    },
  });
}

//************************************************************** */
// Find Active Assignment For Service Bay

export async function findActiveServiceBayAssignmentForBay(
  organizationId: string,
  shopLocationId: string,
  serviceBayId: string,
) {
  return prisma.serviceBayAssignment.findFirst({
    where: {
      organizationId,
      serviceBayId,
      status: "ACTIVE",

      serviceBay: {
        organizationId,
        shopLocationId,
      },
    },
  });
}

//************************************************************** */
// Assign Repair Order To Service Bay

export async function assignRepairOrderToServiceBayRecord(
  organizationId: string,
  shopLocationId: string,
  repairOrderId: string,
  serviceBayId: string,
  assignedByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    const repairOrder = await transaction.repairOrder.findFirst({
      where: {
        id: repairOrderId,
        organizationId,
        shopLocationId,
      },

      select: {
        id: true,
      },
    });

    const serviceBay = await transaction.serviceBay.findFirst({
      where: {
        id: serviceBayId,
        organizationId,
        shopLocationId,
        status: "ACTIVE",
      },

      select: {
        id: true,
      },
    });

    if (!repairOrder || !serviceBay) {
      return null;
    }

    return transaction.serviceBayAssignment.create({
      data: {
        organizationId,
        repairOrderId,
        serviceBayId,
        assignedByMembershipId,

        ...(notes !== undefined
          ? { notes }
          : {}),
      },
    });
  });
}

//************************************************************** */
// Release Repair Order From Service Bay

export async function releaseRepairOrderFromServiceBayRecord(
  organizationId: string,
  shopLocationId: string,
  repairOrderId: string,
  activeAssignmentId: string,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    const releasedAssignment =
      await transaction.serviceBayAssignment.updateMany({
        where: {
          id: activeAssignmentId,
          organizationId,
          repairOrderId,
          status: "ACTIVE",

          repairOrder: {
            organizationId,
            shopLocationId,
          },

          serviceBay: {
            organizationId,
            shopLocationId,
          },
        },

        data: {
          status: "RELEASED",
          releasedAt: new Date(),

          ...(notes !== undefined
            ? { notes }
            : {}),
        },
      });

    if (releasedAssignment.count !== 1) {
      return null;
    }

    return transaction.serviceBayAssignment.findFirst({
      where: {
        id: activeAssignmentId,
        organizationId,

        serviceBay: {
          organizationId,
          shopLocationId,
        },
      },
    });
  });
}

//************************************************************** */
// Update Service Bay Status

export async function updateServiceBayStatusRecord(
  organizationId: string,
  shopLocationId: string,
  serviceBayId: string,
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE",
) {
  const result = await prisma.serviceBay.updateMany({
    where: {
      id: serviceBayId,
      organizationId,
      shopLocationId,
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
      shopLocationId,
    },
  });
}

//************************************************************** */
