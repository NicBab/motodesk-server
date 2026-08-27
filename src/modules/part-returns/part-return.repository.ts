import { prisma } from "../../config/prisma.js";

import type {
  CreatePartReturnInput,
  ListPartReturnsQueryInput,
  UpdatePartReturnCreditInput,
  UpdatePartReturnInput,
} from "./part-return.schemas.js";

import {
  PartInventoryTransactionType,
} from "../../generated/prisma/client.js";

import {
  applyInventoryMutationWithTransaction,
} from "../parts/part-inventory.repository.js";

//************************************************************** */

export interface PartReturnSnapshot {
  partId: string;

  partNumber: string;
  description: string;

  vendorId?: string;
  vendorName?: string;

  purchaseOrderId?: string;
  poNumber?: number;

  repairOrderId?: string;
  roNumber?: number;
}

//************************************************************** */

const partReturnInclude = {
  part: true,

  vendor: true,

  purchaseOrder: true,

  repairOrder: {
    include: {
      customer: true,
      vehicle: true,
    },
  },
} as const;

//************************************************************** */

export async function createPartReturnRecord(
  organizationId: string,
  input: CreatePartReturnInput,
  snapshot: PartReturnSnapshot,
) {
  return prisma.$transaction(async (transaction) => {
    const sequence = await transaction.partReturnSequence.upsert({
      where: {
        organizationId,
      },

      update: {
        nextNumber: {
          increment: 1,
        },
      },

      create: {
        organizationId,

        nextNumber: 1002,
      },
    });

    const returnNumber = sequence.nextNumber - 1;

    return transaction.partReturn.create({
      data: {
        organizationId,

        returnNumber,

        returnType: input.returnType,

        partId: snapshot.partId,

        partNumber: snapshot.partNumber,

        description: snapshot.description,

        quantity: input.quantity,

        vendorId: snapshot.vendorId ?? null,

        vendorName: snapshot.vendorName ?? null,

        purchaseOrderId: snapshot.purchaseOrderId ?? null,

        poNumber: snapshot.poNumber ?? null,

        repairOrderId: snapshot.repairOrderId ?? null,

        roNumber: snapshot.roNumber ?? null,

        restockingFee: input.restockingFee,

        returnAuthorizationNumber: input.returnAuthorizationNumber ?? null,

        creditAmount: input.creditAmount,

        creditStatus: "PENDING",

        notes: input.notes ?? null,

        status: "PENDING",
      },

      include: partReturnInclude,
    });
  });
}

//************************************************************** */

export async function findPartReturnById(
  organizationId: string,
  partReturnId: string,
) {
  return prisma.partReturn.findFirst({
    where: {
      id: partReturnId,

      organizationId,
    },

    include: partReturnInclude,
  });
}

//************************************************************** */

export async function findPartReturnsByOrganization(
  organizationId: string,
  query: ListPartReturnsQueryInput,
) {
  return prisma.partReturn.findMany({
    where: {
      organizationId,

      ...(query.returnType !== undefined
        ? {
            returnType: query.returnType,
          }
        : {}),

      ...(query.status !== undefined
        ? {
            status: query.status,
          }
        : {}),

      ...(query.creditStatus !== undefined
        ? {
            creditStatus: query.creditStatus,
          }
        : {}),

      ...(query.vendorId !== undefined
        ? {
            vendorId: query.vendorId,
          }
        : {}),

      ...(query.partId !== undefined
        ? {
            partId: query.partId,
          }
        : {}),

      ...(query.purchaseOrderId !== undefined
        ? {
            purchaseOrderId: query.purchaseOrderId,
          }
        : {}),

      ...(query.repairOrderId !== undefined
        ? {
            repairOrderId: query.repairOrderId,
          }
        : {}),

      ...(query.isActive !== undefined
        ? {
            isActive: query.isActive,
          }
        : {}),

      ...(query.search !== undefined
        ? {
            OR: [
              {
                partNumber: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                description: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                vendorName: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                returnAuthorizationNumber: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                notes: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                vendor: {
                  name: {
                    contains: query.search,

                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    },

    include: partReturnInclude,

    orderBy: {
      createdAt: "desc",
    },
  });
}

//************************************************************** */

export async function updatePartReturnRecord(
  organizationId: string,
  partReturnId: string,
  input: UpdatePartReturnInput,
  snapshot?: Partial<PartReturnSnapshot>,
) {
  return prisma.partReturn.updateMany({
    where: {
      id: partReturnId,

      organizationId,
    },

    data: {
      ...(input.returnType !== undefined
        ? {
            returnType: input.returnType,
          }
        : {}),

      ...(input.quantity !== undefined
        ? {
            quantity: input.quantity,
          }
        : {}),

      ...(input.vendorId !== undefined
        ? {
            vendorId: input.vendorId,

            vendorName: snapshot?.vendorName ?? null,
          }
        : {}),

      ...(input.purchaseOrderId !== undefined
        ? {
            purchaseOrderId: input.purchaseOrderId,

            poNumber: snapshot?.poNumber ?? null,
          }
        : {}),

      ...(input.repairOrderId !== undefined
        ? {
            repairOrderId: input.repairOrderId,

            roNumber: snapshot?.roNumber ?? null,
          }
        : {}),

      ...(input.restockingFee !== undefined
        ? {
            restockingFee: input.restockingFee,
          }
        : {}),

      ...(input.returnAuthorizationNumber !== undefined
        ? {
            returnAuthorizationNumber: input.returnAuthorizationNumber,
          }
        : {}),

      ...(input.creditAmount !== undefined
        ? {
            creditAmount: input.creditAmount,
          }
        : {}),

      ...(input.notes !== undefined
        ? {
            notes: input.notes,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function updatePartReturnCreditRecord(
  organizationId: string,
  partReturnId: string,
  input: UpdatePartReturnCreditInput,
) {
  return prisma.partReturn.updateMany({
    where: {
      id: partReturnId,

      organizationId,
    },

    data: {
      creditAmount: input.creditAmount,

      creditStatus: input.creditStatus,
    },
  });
}

//************************************************************** */

export async function updatePartReturnStatusRecord(
  organizationId: string,
  partReturnId: string,
  status: "PENDING" | "SHIPPED" | "CREDITED" | "CLOSED",
) {
  return prisma.partReturn.updateMany({
    where: {
      id: partReturnId,

      organizationId,
    },

    data: {
      status,
    },
  });
}

//************************************************************** */

export async function archivePartReturnRecord(
  organizationId: string,
  partReturnId: string,
) {
  return prisma.partReturn.updateMany({
    where: {
      id: partReturnId,

      organizationId,
    },

    data: {
      isActive: false,
    },
  });
}

//************************************************************** */

export async function recordPartReturnCreditRecord(
  organizationId: string,
  partReturnId: string,
  input: UpdatePartReturnCreditInput,
) {
  return prisma.partReturn.updateMany({
    where: {
      id: partReturnId,

      organizationId,

      status: "SHIPPED",
    },

    data: {
      creditAmount: input.creditAmount,

      creditStatus: input.creditStatus,

      ...(input.creditStatus === "RECEIVED"
        ? {
            status: "CREDITED",
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function closePartReturnToInventoryRecord(
  organizationId: string,
  partReturnId: string,
  membershipId: string | null,
) {
  return prisma.$transaction(async (transaction) => {
    const partReturn = await transaction.partReturn.findFirst({
      where: {
        id: partReturnId,

        organizationId,

        status: "PENDING",
      },
    });

    if (!partReturn || !partReturn.partId) {
      return null;
    }

    const closeResult = await transaction.partReturn.updateMany({
      where: {
        id: partReturnId,

        organizationId,

        status: "PENDING",
      },

      data: {
        status: "CLOSED",
      },
    });

    if (closeResult.count !== 1) {
      return null;
    }

    const quantity = Number(
      partReturn.quantity.toString(),
    );

    const inventoryResult =
      await applyInventoryMutationWithTransaction(
        transaction,
        {
          partId: partReturn.partId,

          type: PartInventoryTransactionType.RETURN,

          quantity,

          onHandDelta: quantity,

          referenceType: "PART_RETURN",

          referenceId: partReturn.id,

          notes: `Part return #${partReturn.returnNumber} returned to inventory.`,

          createdByMembershipId: membershipId,
        },
      );

    if (!inventoryResult) {
      throw new Error(
        "Part return inventory mutation could not be completed.",
      );
    }

    return transaction.partReturn.findUnique({
      where: {
        id: partReturn.id,
      },

      include: partReturnInclude,
    });
  });
}

//************************************************************** */

