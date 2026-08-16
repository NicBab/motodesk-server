import {
  prisma,
} from "../../config/prisma.js";

import type {
  CreateRepairOrderPartLineInput,
  UpdateRepairOrderPartLineInput,
} from "./repair-order-part.schemas.js";

import type {
  RepairOrderPartStatus,
} from "../../generated/prisma/client.js";

import {
  PartInventoryTransactionType,
} from "../../generated/prisma/client.js";

import {
  applyInventoryMutationWithTransaction,
} from "../parts/part-inventory.repository.js";

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

//************************************************************** */

export interface RepairOrderPartLineWorkflowUpdate {
  status?: RepairOrderPartStatus;
  allocatedQty?: number;
  orderedQty?: number;
  receivedQty?: number;
  pulledQty?: number;
  installedQty?: number;
}

//************************************************************** */

export async function updateRepairOrderPartLineWorkflowRecord(
  repairOrderId: string,
  partLineId: string,
  data: RepairOrderPartLineWorkflowUpdate,
) {
  return prisma.repairOrderPartLine.updateMany({
    where: {
      id:
        partLineId,
      repairOrderId,
    },

    data: {
      ...(data.status !== undefined
        ? {
            status:
              data.status,
          }
        : {}),

      ...(data.allocatedQty !== undefined
        ? {
            allocatedQty:
              data.allocatedQty,
          }
        : {}),

      ...(data.orderedQty !== undefined
        ? {
            orderedQty:
              data.orderedQty,
          }
        : {}),

      ...(data.receivedQty !== undefined
        ? {
            receivedQty:
              data.receivedQty,
          }
        : {}),

      ...(data.pulledQty !== undefined
        ? {
            pulledQty:
              data.pulledQty,
          }
        : {}),

      ...(data.installedQty !== undefined
        ? {
            installedQty:
              data.installedQty,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function allocateRepairOrderPartLineRecord(
  repairOrderId: string,
  partLineId: string,
  partId: string,
  quantity: number,
  currentAllocatedQty: number,
  createdByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const inventoryResult =
        await applyInventoryMutationWithTransaction(
          transaction,
          {
            partId,

            type:
              PartInventoryTransactionType.ALLOCATION,

            quantity,

            allocatedDelta:
              quantity,

            referenceType:
              "REPAIR_ORDER",

            referenceId:
              repairOrderId,

            ...(notes !== undefined
              ? {
                  notes,
                }
              : {}),

            createdByMembershipId,
          },
        );

      if (!inventoryResult) {
        return null;
      }

      const allocatedQty =
        currentAllocatedQty +
        quantity;

      await transaction.repairOrderPartLine.update({
        where: {
          id:
            partLineId,
        },

        data: {
          allocatedQty,

          status:
            "ALLOCATED",
        },
      });

      return {
        part:
          inventoryResult.part,

        inventoryTransaction:
          inventoryResult.transaction,

        allocatedQty,
      };
    },
  );
}

//************************************************************** */

export async function deallocateRepairOrderPartLineRecord(
  repairOrderId: string,
  partLineId: string,
  partId: string,
  quantity: number,
  currentAllocatedQty: number,
  createdByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const inventoryResult =
        await applyInventoryMutationWithTransaction(
          transaction,
          {
            partId,

            type:
              PartInventoryTransactionType.DEALLOCATION,

            quantity,

            allocatedDelta:
              -quantity,

            referenceType:
              "REPAIR_ORDER",

            referenceId:
              repairOrderId,

            ...(notes !== undefined
              ? {
                  notes,
                }
              : {}),

            createdByMembershipId,
          },
        );

      if (!inventoryResult) {
        return null;
      }

      const allocatedQty =
        currentAllocatedQty -
        quantity;

      await transaction.repairOrderPartLine.update({
        where: {
          id:
            partLineId,
        },

        data: {
          allocatedQty,

          status:
            allocatedQty > 0
              ? "ALLOCATED"
              : "AVAILABLE",
        },
      });

      return {
        part:
          inventoryResult.part,

        inventoryTransaction:
          inventoryResult.transaction,

        allocatedQty,
      };
    },
  );
}

//************************************************************** */

export async function issueRepairOrderPartLineRecord(
  repairOrderId: string,
  partLineId: string,
  partId: string,
  quantity: number,
  currentAllocatedQty: number,
  currentPulledQty: number,
  createdByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const inventoryResult =
        await applyInventoryMutationWithTransaction(
          transaction,
          {
            partId,

            type:
              PartInventoryTransactionType.ISSUE,

            quantity,

            onHandDelta:
              -quantity,

            allocatedDelta:
              -quantity,

            referenceType:
              "REPAIR_ORDER",

            referenceId:
              repairOrderId,

            ...(notes !== undefined
              ? {
                  notes,
                }
              : {}),

            createdByMembershipId,
          },
        );

      if (!inventoryResult) {
        return null;
      }

      const allocatedQty =
        currentAllocatedQty -
        quantity;

      const pulledQty =
        currentPulledQty +
        quantity;

      await transaction.repairOrderPartLine.update({
        where: {
          id:
            partLineId,
        },

        data: {
          allocatedQty,
          pulledQty,
          status:
            "ISSUED",
        },
      });

      return {
        part:
          inventoryResult.part,

        inventoryTransaction:
          inventoryResult.transaction,

        allocatedQty,
        pulledQty,
      };
    },
  );
}

//************************************************************** */

export async function installRepairOrderPartLineRecord(
  repairOrderId: string,
  partLineId: string,
  quantity: number,
  currentInstalledQty: number,
  requiredQty: number,
) {
  const installedQty =
    currentInstalledQty +
    quantity;

  const status =
    installedQty >= requiredQty
      ? "INSTALLED"
      : "ISSUED";

  await prisma.repairOrderPartLine.update({
    where: {
      id:
        partLineId,
    },

    data: {
      installedQty,
      status,
    },
  });

  return {
    installedQty,
    status,
  };
}

//************************************************************** */

export async function markRepairOrderPartToBeOrderedRecord(
  repairOrderId: string,
  partLineId: string,
) {
  return prisma.repairOrderPartLine.update({
    where: {
      id:
        partLineId,
    },

    data: {
      status:
        "TO_BE_ORDERED",
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