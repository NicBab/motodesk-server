import { prisma } from "../../config/prisma.js";

import type {
  RescheduleRepairOrderInput,
  ScheduleRepairOrderInput,
} from "./schedule.schemas.js";

//************************************************************** */

const scheduleInclude = {
  technicianEmployee: {
    include: {
      membership: {
        include: {
          user: true,
        },
      },
    },
  },

  laborLine: true,

  repairOrder: {
    include: {
      customer: true,

      vehicle: true,

      partLines: {
        include: {
          part: true,
        },
      },
    },
  },
} as const;

//************************************************************** */

const dispatchTechnicianInclude = {
  membership: {
    include: {
      user: true,
    },
  },
} as const;

//************************************************************** */
// Schedule Lookup

export async function findScheduleById(
  organizationId: string,
  scheduleId: string,
) {
  return prisma.schedule.findFirst({
    where: {
      id: scheduleId,
      organizationId,
    },

    include: scheduleInclude,
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

    include: scheduleInclude,

    orderBy: [
      {
        scheduledDate: "asc",
      },

      {
        createdAt: "asc",
      },
    ],
  });
}

//************************************************************** */
// Dispatch Board Technicians

export async function findSchedulableTechnicians(organizationId: string) {
  return prisma.employee.findMany({
    where: {
      organizationId,

      role: "TECHNICIAN",

      status: "ACTIVE",

      isSchedulable: true,
    },

    include: dispatchTechnicianInclude,

    orderBy: [
      {
        lastName: "asc",
      },

      {
        firstName: "asc",
      },
    ],
  });
}

//************************************************************** */
// Dispatch Board Work Blocks

export async function findSchedulesForRange(
  organizationId: string,
  start: Date,
  end: Date,
) {
  return prisma.schedule.findMany({
    where: {
      organizationId,

      status: {
        not: "CANCELLED",
      },

      // Include any work block that overlaps the requested range.
      //
      // start -------- end
      //       [block]
      //
      // and blocks spanning the entire range are both included.

      scheduledDate: {
        lt: end,
      },

      scheduledEnd: {
        gt: start,
      },
    },

    include: scheduleInclude,

    orderBy: [
      {
        technicianEmployeeId: "asc",
      },

      {
        scheduledDate: "asc",
      },

      {
        scheduledEnd: "asc",
      },
    ],
  });
}

//************************************************************** */
// Unscheduled Ready-To-Work ROs
//
// Scheduling is optional.
//
// A READY_TO_WORK repair order is simply available to schedule.
// It does not need a Schedule record to continue through the
// ordinary repair-order lifecycle.

export async function findUnscheduledReadyToWorkRepairOrders(
  organizationId: string,
) {
  return prisma.repairOrder.findMany({
    where: {
      organizationId,

      isActive: true,

      status: "READY_TO_WORK",
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
    },

    orderBy: [
      {
        priority: "desc",
      },

      {
        createdAt: "asc",
      },
    ],
  });
}

//************************************************************** */
// Schedule Repair Order
//
// This transition is deliberately optional.
//
// Nothing elsewhere requires an RO to enter SCHEDULED. This
// transaction only runs when a user explicitly schedules an RO.

export async function scheduleRepairOrderRecord(
  organizationId: string,
  repairOrderId: string,
  changedByMembershipId: string | null,
  input: ScheduleRepairOrderInput,
) {
  return prisma.$transaction(async (transaction) => {
    //************************************************************** */
    // Atomically claim the READY_TO_WORK -> SCHEDULED transition.

    const repairOrderUpdate = await transaction.repairOrder.updateMany({
      where: {
        id: repairOrderId,

        organizationId,

        status: "READY_TO_WORK",
      },

      data: {
        status: "SCHEDULED",

        scheduledDate: input.scheduledDate,

        ...(input.promisedDate !== undefined
          ? {
              promisedDate: input.promisedDate,
            }
          : {}),
      },
    });

    if (repairOrderUpdate.count !== 1) {
      return null;
    }

    //************************************************************** */
    // Create active technician work block.

    const schedule = await transaction.schedule.create({
      data: {
        organizationId,

        repairOrderId,

        technicianEmployeeId: input.technicianEmployeeId,

        laborLineId: input.laborLineId ?? null,

        scheduledDate: input.scheduledDate,

        scheduledEnd: input.scheduledEnd,

        promisedDate: input.promisedDate ?? null,

        status: input.status ?? "SCHEDULED",

        waitingCustomer: input.waitingCustomer ?? false,

        notes: input.notes ?? null,
      },

      include: scheduleInclude,
    });

    //************************************************************** */
    // Preserve RO lifecycle history.

    await transaction.repairOrderStatusHistory.create({
      data: {
        repairOrderId,

        previousStatus: "READY_TO_WORK",

        status: "SCHEDULED",

        changedByMembershipId,

        notes: input.notes ?? "Repair order scheduled.",

        automatic: false,
      },
    });

    return schedule;
  });
}

//************************************************************** */
// Reschedule Repair Order
//
// The former block is retained as cancelled history and a new
// active block is created.

export async function rescheduleRepairOrderRecord(
  organizationId: string,
  repairOrderId: string,
  input: RescheduleRepairOrderInput,
) {
  return prisma.$transaction(async (transaction) => {
    const currentSchedule = await transaction.schedule.findFirst({
      where: {
        organizationId,

        repairOrderId,

        status: {
          notIn: ["CANCELLED", "COMPLETED", "MISSED"],
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    if (!currentSchedule) {
      return null;
    }

    //************************************************************** */
    // Close previous block while preserving schedule history.

    await transaction.schedule.update({
      where: {
        id: currentSchedule.id,
      },

      data: {
        status: "CANCELLED",

        cancelledAt: new Date(),

        cancellationNotes: "Rescheduled.",
      },
    });

    //************************************************************** */
    // Create replacement block.

    const schedule = await transaction.schedule.create({
      data: {
        organizationId,

        repairOrderId,

        technicianEmployeeId: input.technicianEmployeeId,

        laborLineId:
          input.laborLineId !== undefined
            ? input.laborLineId
            : currentSchedule.laborLineId,

        scheduledDate: input.scheduledDate,

        scheduledEnd: input.scheduledEnd,

        promisedDate:
          input.promisedDate !== undefined
            ? input.promisedDate
            : currentSchedule.promisedDate,

        status: "SCHEDULED",

        waitingCustomer:
          input.waitingCustomer !== undefined
            ? input.waitingCustomer
            : currentSchedule.waitingCustomer,

        notes: input.notes ?? null,
      },

      include: scheduleInclude,
    });

    //************************************************************** */
    // Keep the RO's summary schedule fields synchronized.

    await transaction.repairOrder.update({
      where: {
        id: repairOrderId,
      },

      data: {
        scheduledDate: input.scheduledDate,

        ...(input.promisedDate !== undefined
          ? {
              promisedDate: input.promisedDate,
            }
          : {}),
      },
    });

    return schedule;
  });
}

//************************************************************** */
// Cancel Active Repair Order Schedule

export async function cancelRepairOrderScheduleRecord(
  organizationId: string,
  repairOrderId: string,
  changedByMembershipId: string | null,
  cancellationNotes: string,
) {
  return prisma.$transaction(async (transaction) => {
    //************************************************************** */
    // Find current active schedule.

    const schedule = await transaction.schedule.findFirst({
      where: {
        organizationId,

        repairOrderId,

        status: {
          notIn: ["CANCELLED", "COMPLETED", "MISSED"],
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    if (!schedule) {
      return null;
    }

    //************************************************************** */
    // Require the RO to still be in its optional SCHEDULED state.

    const repairOrderUpdate = await transaction.repairOrder.updateMany({
      where: {
        id: repairOrderId,

        organizationId,

        status: "SCHEDULED",
      },

      data: {
        status: "READY_TO_WORK",

        scheduledDate: null,
      },
    });

    if (repairOrderUpdate.count !== 1) {
      return null;
    }

    //************************************************************** */
    // Preserve schedule history.

    const cancelledSchedule = await transaction.schedule.update({
      where: {
        id: schedule.id,
      },

      data: {
        status: "CANCELLED",

        cancelledAt: new Date(),

        cancellationNotes,
      },

      include: scheduleInclude,
    });

    //************************************************************** */
    // Preserve RO workflow history.

    await transaction.repairOrderStatusHistory.create({
      data: {
        repairOrderId,

        previousStatus: "SCHEDULED",

        status: "READY_TO_WORK",

        changedByMembershipId,

        notes: cancellationNotes,

        automatic: false,
      },
    });

    return cancelledSchedule;
  });
}

//************************************************************** */
