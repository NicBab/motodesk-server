import {
  prisma,
} from "../../config/prisma.js";

import type {
  CreateRepairOrderPartLineInput,
  UpdateRepairOrderPartLineInput,
} from "./repair-order-part.schemas.js";

//************************************************************** */

export async function createRepairOrderPartLineRecord(
  repairOrderId: string,
  input: CreateRepairOrderPartLineInput,
) {
  return prisma.repairOrderPartLine.create({
    data: {
      repairOrderId,

      partId:
        input.partId ??
        null,

      partNumber:
        input.partNumber,

      description:
        input.description,

      quantity:
        input.quantity,

      unitPrice:
        input.unitPrice,

      requiredQty:
        input.requiredQty,

      approvedQty:
        input.approvedQty,

      allocatedQty:
        input.allocatedQty,

      orderedQty:
        input.orderedQty,

      receivedQty:
        input.receivedQty,

      pulledQty:
        input.pulledQty,

      installedQty:
        input.installedQty,

      estimatedCost:
        input.estimatedCost,

      actualCost:
        input.actualCost,

      vendorName:
        input.vendorName ??
        null,

      status:
        input.status,

      resolutionMethod:
        input.resolutionMethod ??
        null,

      blocksWork:
        input.blocksWork,
    },

    include: {
      part: true,
    },
  });
}

//************************************************************** */

export async function findRepairOrderPartLineById(
  repairOrderId: string,
  partLineId: string,
) {
  return prisma.repairOrderPartLine.findFirst({
    where: {
      id:
        partLineId,
      repairOrderId,
    },

    include: {
      part: true,
    },
  });
}

//************************************************************** */

export async function findRepairOrderPartLines(
  repairOrderId: string,
) {
  return prisma.repairOrderPartLine.findMany({
    where: {
      repairOrderId,
    },

    include: {
      part: true,
    },

    orderBy: {
      createdAt:
        "asc",
    },
  });
}

//************************************************************** */

export async function updateRepairOrderPartLineRecord(
  repairOrderId: string,
  partLineId: string,
  input: UpdateRepairOrderPartLineInput,
) {
  return prisma.repairOrderPartLine.updateMany({
    where: {
      id:
        partLineId,
      repairOrderId,
    },

    data: {
      ...(input.partId !== undefined
        ? {
            partId:
              input.partId,
          }
        : {}),

      ...(input.partNumber !== undefined
        ? {
            partNumber:
              input.partNumber,
          }
        : {}),

      ...(input.description !== undefined
        ? {
            description:
              input.description,
          }
        : {}),

      ...(input.quantity !== undefined
        ? {
            quantity:
              input.quantity,
          }
        : {}),

      ...(input.unitPrice !== undefined
        ? {
            unitPrice:
              input.unitPrice,
          }
        : {}),

      ...(input.requiredQty !== undefined
        ? {
            requiredQty:
              input.requiredQty,
          }
        : {}),

      ...(input.approvedQty !== undefined
        ? {
            approvedQty:
              input.approvedQty,
          }
        : {}),

      ...(input.allocatedQty !== undefined
        ? {
            allocatedQty:
              input.allocatedQty,
          }
        : {}),

      ...(input.orderedQty !== undefined
        ? {
            orderedQty:
              input.orderedQty,
          }
        : {}),

      ...(input.receivedQty !== undefined
        ? {
            receivedQty:
              input.receivedQty,
          }
        : {}),

      ...(input.pulledQty !== undefined
        ? {
            pulledQty:
              input.pulledQty,
          }
        : {}),

      ...(input.installedQty !== undefined
        ? {
            installedQty:
              input.installedQty,
          }
        : {}),

      ...(input.estimatedCost !== undefined
        ? {
            estimatedCost:
              input.estimatedCost,
          }
        : {}),

      ...(input.actualCost !== undefined
        ? {
            actualCost:
              input.actualCost,
          }
        : {}),

      ...(input.vendorName !== undefined
        ? {
            vendorName:
              input.vendorName,
          }
        : {}),

      ...(input.status !== undefined
        ? {
            status:
              input.status,
          }
        : {}),

      ...(input.resolutionMethod !== undefined
        ? {
            resolutionMethod:
              input.resolutionMethod,
          }
        : {}),

      ...(input.blocksWork !== undefined
        ? {
            blocksWork:
              input.blocksWork,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function deleteRepairOrderPartLineRecord(
  repairOrderId: string,
  partLineId: string,
) {
  return prisma.repairOrderPartLine.deleteMany({
    where: {
      id:
        partLineId,
      repairOrderId,
    },
  });
}