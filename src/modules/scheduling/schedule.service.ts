import { AppError } from "../../platform/errors/app-error.js";

import { getEmployeeById } from "../employees/employee.service.js";

import { findRepairOrderLaborLineById } from "../repair-orders/repair-order-labor.repository.js";

import { getRepairOrderById } from "../repair-orders/repair-order.service.js";

import {
  cancelRepairOrderScheduleRecord,
  findSchedulableTechnicians,
  findSchedulesForRange,
  findUnscheduledReadyToWorkRepairOrders,
  rescheduleRepairOrderRecord,
  scheduleRepairOrderRecord,
} from "./schedule.repository.js";

import type {
  CancelScheduleInput,
  RescheduleRepairOrderInput,
  ScheduleBoardQueryInput,
  ScheduleRepairOrderInput,
} from "./schedule.schemas.js";

//************************************************************** */
// Validation Helpers

async function assertSchedulableTechnician(
  organizationId: string,
  employeeId: string,
) {
  const employee = await getEmployeeById(organizationId, employeeId);

  if (employee.role !== "TECHNICIAN") {
    throw new AppError(400, "The selected employee is not a technician.", {
      code: "SCHEDULE_TECHNICIAN_ROLE_INVALID",
    });
  }

  if (employee.status !== "ACTIVE") {
    throw new AppError(400, "The selected technician is not active.", {
      code: "SCHEDULE_TECHNICIAN_INACTIVE",
    });
  }

  if (!employee.isSchedulable) {
    throw new AppError(
      400,
      "The selected technician is not available for scheduling.",
      {
        code: "SCHEDULE_TECHNICIAN_NOT_SCHEDULABLE",
      },
    );
  }

  return employee;
}

//************************************************************** */

async function assertLaborLineBelongsToRepairOrder(
  repairOrderId: string,
  laborLineId: string | null | undefined,
): Promise<void> {
  if (!laborLineId) {
    return;
  }

  const laborLine = await findRepairOrderLaborLineById(
    repairOrderId,
    laborLineId,
  );

  if (!laborLine) {
    throw new AppError(
      400,
      "The selected labor line does not belong to this repair order.",
      {
        code: "SCHEDULE_LABOR_LINE_INVALID",
      },
    );
  }
}

//************************************************************** */
// Dispatch Board

export async function getScheduleBoard(
  organizationId: string,
  query: ScheduleBoardQueryInput,
) {
  const [technicians, schedules, unscheduledRepairOrders] = await Promise.all([
    findSchedulableTechnicians(organizationId),

    findSchedulesForRange(organizationId, query.start, query.end),

    findUnscheduledReadyToWorkRepairOrders(organizationId),
  ]);

  return {
    range: {
      start: query.start,

      end: query.end,
    },

    technicians,

    schedules,

    unscheduledRepairOrders,
  };
}

//************************************************************** */
// Schedule Repair Order

export async function scheduleRepairOrder(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: ScheduleRepairOrderInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "READY_TO_WORK") {
    throw new AppError(
      400,
      "Repair order can only be scheduled when it is ready to work.",
      {
        code: "SCHEDULE_REPAIR_ORDER_INVALID_STATUS",
      },
    );
  }

  await assertSchedulableTechnician(organizationId, input.technicianEmployeeId);

  await assertLaborLineBelongsToRepairOrder(repairOrderId, input.laborLineId);

  const schedule = await scheduleRepairOrderRecord(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  if (!schedule) {
    throw new AppError(400, "Repair order could not be scheduled.", {
      code: "SCHEDULE_REPAIR_ORDER_FAILED",
    });
  }

  return schedule;
}

//************************************************************** */
// Reschedule Repair Order

export async function rescheduleRepairOrder(
  organizationId: string,
  repairOrderId: string,
  input: RescheduleRepairOrderInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "SCHEDULED") {
    throw new AppError(
      400,
      "Repair order can only be rescheduled while it is currently scheduled.",
      {
        code: "RESCHEDULE_REPAIR_ORDER_INVALID_STATUS",
      },
    );
  }

  await assertSchedulableTechnician(organizationId, input.technicianEmployeeId);

  await assertLaborLineBelongsToRepairOrder(repairOrderId, input.laborLineId);

  const schedule = await rescheduleRepairOrderRecord(
    organizationId,
    repairOrderId,
    input,
  );

  if (!schedule) {
    throw new AppError(
      404,
      "No active schedule was found for this repair order.",
      {
        code: "REPAIR_ORDER_SCHEDULE_NOT_FOUND",
      },
    );
  }

  return schedule;
}

//************************************************************** */
// Cancel Schedule

export async function cancelRepairOrderSchedule(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: CancelScheduleInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "SCHEDULED") {
    throw new AppError(
      400,
      "Repair order schedule can only be cancelled while the repair order is scheduled.",
      {
        code: "CANCEL_SCHEDULE_INVALID_STATUS",
      },
    );
  }

  const cancelledSchedule = await cancelRepairOrderScheduleRecord(
    organizationId,
    repairOrderId,
    membershipId,
    input.notes,
  );

  if (!cancelledSchedule) {
    throw new AppError(
      404,
      "No active schedule was found for this repair order.",
      {
        code: "ACTIVE_SCHEDULE_NOT_FOUND",
      },
    );
  }

  return cancelledSchedule;
}

//************************************************************** */
