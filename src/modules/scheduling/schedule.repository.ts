import { prisma } from "../../config/prisma.js";

//************************************************************** */

export async function createScheduleRecord(
  organizationId: string,
  repairOrderId: string,
  scheduledDate: Date,
  promisedDate?: Date,
  notes?: string,
) {
  return prisma.schedule.create({
    data: {
      organizationId,
      repairOrderId,
      scheduledDate,

      ...(promisedDate !== undefined
        ? {
            promisedDate,
          }
        : {}),

      ...(notes !== undefined
        ? {
            notes,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function findScheduleById(
  organizationId: string,
  scheduleId: string,
) {
  return prisma.schedule.findFirst({
    where: {
      id: scheduleId,

      organizationId,
    },
  });
}

//************************************************************** */

export async function listRepairOrderSchedules(
  organizationId: string,
  repairOrderId: string,
) {
  return prisma.schedule.findMany({
    where: {
      organizationId,
      repairOrderId,
    },

    orderBy: {
      scheduledDate: "asc",
    },
  });
}

//************************************************************** */

export async function scheduleRepairOrderRecord(
  organizationId: string,
  repairOrderId: string,
  scheduledDate: Date,
  changedByMembershipId: string | null,
  promisedDate?: Date,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    // Lock the workflow transition by requiring READY_TO_WORK

    const repairOrderUpdate = await transaction.repairOrder.updateMany({
      where: {
        id: repairOrderId,

        organizationId,

        status: "READY_TO_WORK",
      },

      data: {
        status: "SCHEDULED",

        ...(promisedDate !== undefined
          ? {
              promisedDate,
            }
          : {}),
      },
    });

    if (repairOrderUpdate.count !== 1) {
      return null;
    }

    //************************************************************** */
    // Create schedule entry

    const schedule = await transaction.schedule.create({
      data: {
        organizationId,
        repairOrderId,
        scheduledDate,

        ...(promisedDate !== undefined
          ? {
              promisedDate,
            }
          : {}),

        ...(notes !== undefined
          ? {
              notes,
            }
          : {}),
      },
    });

    //************************************************************** */
    // Record RO workflow history

    await transaction.repairOrderStatusHistory.create({
      data: {
        repairOrderId,

        previousStatus: "READY_TO_WORK",

        status: "SCHEDULED",

        changedByMembershipId,

        notes: notes ?? "Repair order scheduled.",

        automatic: false,
      },
    });

    return schedule;
  });
}

//************************************************************** */

export async function rescheduleRepairOrderRecord(
  organizationId: string,
  repairOrderId: string,
  scheduledDate: Date,
  promisedDate?: Date,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    const currentSchedule = await transaction.schedule.findFirst({
      where: {
        organizationId,
        repairOrderId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    if (!currentSchedule) {
      return null;
    }

    const schedule = await transaction.schedule.create({
      data: {
        organizationId,
        repairOrderId,
        scheduledDate,

        ...(promisedDate !== undefined
          ? {
              promisedDate,
            }
          : {
              promisedDate: currentSchedule.promisedDate,
            }),

        ...(notes !== undefined
          ? {
              notes,
            }
          : {}),
      },
    });

    if (promisedDate !== undefined) {
      await transaction.repairOrder.updateMany({
        where: {
          id: repairOrderId,

          organizationId,
        },

        data: {
          promisedDate,
        },
      });
    }

    return schedule;
  });
}

//************************************************************** */

export async function cancelRepairOrderScheduleRecord(
  organizationId: string,
  repairOrderId: string,
  changedByMembershipId: string | null,
  cancellationNotes: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      //************************************************************** */
      // Find current active schedule

      const schedule =
        await transaction.schedule.findFirst({
          where: {
            organizationId,
            repairOrderId,
            status:
              "SCHEDULED",
          },

          orderBy: {
            createdAt:
              "desc",
          },
        });

      if (!schedule) {
        return null;
      }

      //************************************************************** */
      // Require RO to still be SCHEDULED

      const repairOrderUpdate =
        await transaction.repairOrder.updateMany({
          where: {
            id:
              repairOrderId,

            organizationId,

            status:
              "SCHEDULED",
          },

          data: {
            status:
              "READY_TO_WORK",
          },
        });

      if (
        repairOrderUpdate.count !==
        1
      ) {
        return null;
      }

      //************************************************************** */
      // Cancel schedule while preserving history

      const cancelledSchedule =
        await transaction.schedule.update({
          where: {
            id:
              schedule.id,
          },

          data: {
            status:
              "CANCELLED",

            cancelledAt:
              new Date(),

            cancellationNotes,
          },
        });

      //************************************************************** */
      // Record RO workflow history

      await transaction.repairOrderStatusHistory.create({
        data: {
          repairOrderId,

          previousStatus:
            "SCHEDULED",

          status:
            "READY_TO_WORK",

          changedByMembershipId,

          notes:
            cancellationNotes,

          automatic:
            false,
        },
      });

      return cancelledSchedule;
    },
  );
}
