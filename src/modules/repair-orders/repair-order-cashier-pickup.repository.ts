import { prisma } from "../../config/prisma.js";

import type {
  CashierRepairOrderInput,
  PickupRepairOrderInput,
} from "./repair-order.schemas.js";

//************************************************************** */

export async function cashierRepairOrderRecord(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: CashierRepairOrderInput,
) {
  return prisma.$transaction(async (transaction) => {
    const cashieredDate = new Date();

    const updateResult = await transaction.repairOrder.updateMany({
      where: {
        id: repairOrderId,
        organizationId,
        status: "READY_FOR_PICKUP",
      },

      data: {
        status: "CASHIERED",

        cashierStatus: "COMPLETED",

        cashieredDate,

        pickupStatus: "READY",

        ...(input.paymentReference !== undefined
          ? {
              paymentReference: input.paymentReference,
            }
          : {}),

        ...(input.paymentRemote !== undefined
          ? {
              paymentRemote: input.paymentRemote,
            }
          : {}),

        ...(input.remainingBalance !== undefined
          ? {
              remainingBalance: input.remainingBalance,
            }
          : {}),
      },
    });

    if (updateResult.count !== 1) {
      return null;
    }

    await transaction.repairOrderStatusHistory.create({
      data: {
        repairOrderId,

        previousStatus: "READY_FOR_PICKUP",

        status: "CASHIERED",

        changedByMembershipId: membershipId,

        notes: input.notes ?? "Repair order cashiered.",

        automatic: false,
      },
    });

    return transaction.repairOrder.findFirst({
      where: {
        id: repairOrderId,
        organizationId,
      },

      include: {
        customer: true,

        vehicle: true,

        serviceAdvisor: {
          include: {
            user: true,
          },
        },

        primaryTechnician: {
          include: {
            user: true,
          },
        },

        laborLines: {
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
        },

        partLines: {
          include: {
            part: true,
          },

          orderBy: {
            createdAt: "asc",
          },
        },

        statusHistory: {
          include: {
            changedByMembership: {
              include: {
                user: true,
              },
            },
          },

          orderBy: {
            changedAt: "asc",
          },
        },
      },
    });
  });
}

//************************************************************** */

export async function pickupRepairOrderRecord(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: PickupRepairOrderInput,
) {
  return prisma.$transaction(async (transaction) => {
    const pickupDate = new Date();

    const updateResult = await transaction.repairOrder.updateMany({
      where: {
        id: repairOrderId,
        organizationId,
        status: "CASHIERED",
      },

      data: {
        status: "PICKED_UP",

        pickupStatus: "COMPLETED",

        pickupDate,

        ...(input.pickupRecipient !== undefined
          ? {
              pickupRecipient: input.pickupRecipient,
            }
          : {}),

        ...(input.notes !== undefined
          ? {
              pickupNotes: input.notes,
            }
          : {}),
      },
    });

    if (updateResult.count !== 1) {
      return null;
    }

    await transaction.repairOrderStatusHistory.create({
      data: {
        repairOrderId,

        previousStatus: "CASHIERED",

        status: "PICKED_UP",

        changedByMembershipId: membershipId,

        notes: input.notes ?? "Unit picked up by customer.",

        automatic: false,
      },
    });

    return transaction.repairOrder.findFirst({
      where: {
        id: repairOrderId,
        organizationId,
      },

      include: {
        customer: true,

        vehicle: true,

        serviceAdvisor: {
          include: {
            user: true,
          },
        },

        primaryTechnician: {
          include: {
            user: true,
          },
        },

        laborLines: {
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
        },

        partLines: {
          include: {
            part: true,
          },

          orderBy: {
            createdAt: "asc",
          },
        },

        statusHistory: {
          include: {
            changedByMembership: {
              include: {
                user: true,
              },
            },
          },

          orderBy: {
            changedAt: "asc",
          },
        },
      },
    });
  });
}

//************************************************************** */
