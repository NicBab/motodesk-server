import {
  prisma,
} from "../../config/prisma.js";

import type {
  CreateRepairOrderLaborLineInput,
  UpdateRepairOrderLaborLineInput,
} from "./repair-order-labor.schemas.js";

//************************************************************** */

export async function createRepairOrderLaborLineRecord(
  repairOrderId: string,
  input: CreateRepairOrderLaborLineInput,
) {
  return prisma.repairOrderLaborLine.create({
    data: {
      repairOrderId,

      technicianMembershipId:
        input.technicianMembershipId ??
        null,

      description:
        input.description,

      hours:
        input.hours,

      rate:
        input.rate,

      completed:
        input.completed,
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
      id:
        laborLineId,
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

export async function findRepairOrderLaborLines(
  repairOrderId: string,
) {
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
      createdAt:
        "asc",
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
      id:
        laborLineId,
      repairOrderId,
    },

    data: {
      ...(input.technicianMembershipId !== undefined
        ? {
            technicianMembershipId:
              input.technicianMembershipId,
          }
        : {}),

      ...(input.description !== undefined
        ? {
            description:
              input.description,
          }
        : {}),

      ...(input.hours !== undefined
        ? {
            hours:
              input.hours,
          }
        : {}),

      ...(input.rate !== undefined
        ? {
            rate:
              input.rate,
          }
        : {}),

      ...(input.completed !== undefined
        ? {
            completed:
              input.completed,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function deleteRepairOrderLaborLineRecord(
  repairOrderId: string,
  laborLineId: string,
) {
  return prisma.repairOrderLaborLine.deleteMany({
    where: {
      id:
        laborLineId,
      repairOrderId,
    },
  });
}