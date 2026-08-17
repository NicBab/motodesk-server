import { prisma } from "../../config/prisma.js";

import type {
  CreateRepairOrderLaborLineInput,
  UpdateRepairOrderLaborLineInput,
} from "./repair-order-labor.schemas.js";

import type { RepairOrderStatus } from "../../generated/prisma/client.js";

//************************************************************** */

export async function createRepairOrderLaborLineRecord(
  repairOrderId: string,
  input: CreateRepairOrderLaborLineInput,
) {
  return prisma.repairOrderLaborLine.create({
    data: {
      repairOrderId,

      technicianMembershipId: input.technicianMembershipId ?? null,

      description: input.description,

      hours: input.hours,

      rate: input.rate,

      completed: input.completed,
    },

    include: {
      technician: {
        include: {
          user: true,
        },
      },
    },
  });
}

//************************************************************** */

export async function findRepairOrderLaborLineById(
  repairOrderId: string,
  laborLineId: string,
) {
  return prisma.repairOrderLaborLine.findFirst({
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
    },
  });
}

//************************************************************** */

export async function findRepairOrderLaborLines(repairOrderId: string) {
  return prisma.repairOrderLaborLine.findMany({
    where: {
      repairOrderId,
    },

    include: {
      technician: {
        include: {
          user: true,
        },
      },
    },

    orderBy: {
      createdAt: "asc",
    },
  });
}

//************************************************************** */

export async function updateRepairOrderLaborLineRecord(
  repairOrderId: string,
  laborLineId: string,
  input: UpdateRepairOrderLaborLineInput,
) {
  return prisma.repairOrderLaborLine.updateMany({
    where: {
      id: laborLineId,
      repairOrderId,
    },

    data: {
      ...(input.technicianMembershipId !== undefined
        ? {
            technicianMembershipId: input.technicianMembershipId,
          }
        : {}),

      ...(input.description !== undefined
        ? {
            description: input.description,
          }
        : {}),

      ...(input.hours !== undefined
        ? {
            hours: input.hours,
          }
        : {}),

      ...(input.rate !== undefined
        ? {
            rate: input.rate,
          }
        : {}),

      ...(input.completed !== undefined
        ? {
            completed: input.completed,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function startRepairOrderLaborLineRecord(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
  currentRepairOrderStatus: RepairOrderStatus,
  changedByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    const startedAt = new Date();

    const laborLine = await transaction.repairOrderLaborLine.update({
      where: {
        id: laborLineId,
      },

      data: {
        startedAt,
      },

      include: {
        technician: {
          include: {
            user: true,
          },
        },
      },
    });

    const shouldStartRepairOrder =
      currentRepairOrderStatus === "READY_TO_WORK" ||
      currentRepairOrderStatus === "SCHEDULED";

    if (shouldStartRepairOrder) {
      await transaction.repairOrder.updateMany({
        where: {
          id: repairOrderId,

          organizationId,
        },

        data: {
          status: "IN_PROGRESS",
        },
      });

      await transaction.repairOrderStatusHistory.create({
        data: {
          repairOrderId,

          status: "IN_PROGRESS",

          previousStatus: currentRepairOrderStatus,

          changedByMembershipId,

          notes:
            notes ??
            "Repair order automatically moved to IN_PROGRESS when labor began.",

          automatic: true,
        },
      });
    }

    return {
      laborLine,
      repairOrderStatus: shouldStartRepairOrder
        ? "IN_PROGRESS"
        : currentRepairOrderStatus,
    };
  });
}

//************************************************************** */

export async function completeRepairOrderLaborLineRecord(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
  currentRepairOrderStatus: RepairOrderStatus,
  changedByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    const completedAt = new Date();

    const laborLine = await transaction.repairOrderLaborLine.update({
      where: {
        id: laborLineId,
      },

      data: {
        completed: true,

        completedAt,

        ...((
          await transaction.repairOrderLaborLine.findUnique({
            where: {
              id: laborLineId,
            },

            select: {
              startedAt: true,
            },
          })
        )?.startedAt === null
          ? {
              startedAt: completedAt,
            }
          : {}),
      },

      include: {
        technician: {
          include: {
            user: true,
          },
        },
      },
    });

    const remainingIncompleteLabor =
      await transaction.repairOrderLaborLine.count({
        where: {
          repairOrderId,

          completed: false,
        },
      });

    const shouldCompleteRepairOrder =
      remainingIncompleteLabor === 0 &&
      currentRepairOrderStatus === "IN_PROGRESS";

    if (shouldCompleteRepairOrder) {
      await transaction.repairOrder.updateMany({
        where: {
          id: repairOrderId,

          organizationId,

          status: "IN_PROGRESS",
        },

        data: {
          status: "WORK_COMPLETE",
        },
      });

      await transaction.repairOrderStatusHistory.create({
        data: {
          repairOrderId,

          status: "WORK_COMPLETE",

          previousStatus: "IN_PROGRESS",

          changedByMembershipId,

          notes:
            notes ??
            "Repair order automatically moved to WORK_COMPLETE when all labor was completed.",

          automatic: true,
        },
      });
    }

    return {
      laborLine,

      repairOrderStatus: shouldCompleteRepairOrder
        ? "WORK_COMPLETE"
        : currentRepairOrderStatus,

      remainingIncompleteLabor,
    };
  });
}

//************************************************************** */

export async function deleteRepairOrderLaborLineRecord(
  repairOrderId: string,
  laborLineId: string,
) {
  return prisma.repairOrderLaborLine.deleteMany({
    where: {
      id: laborLineId,
      repairOrderId,
    },
  });
}
