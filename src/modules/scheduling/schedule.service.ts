import { AppError } from "../../platform/errors/app-error.js";

import {
  getRepairOrderById,
} from "../repair-orders/repair-order.service.js";

import {
  scheduleRepairOrderRecord,
  rescheduleRepairOrderRecord,
  cancelRepairOrderScheduleRecord
} from "./schedule.repository.js";

import type {
  ScheduleRepairOrderInput,
  RescheduleRepairOrderInput,
  CancelScheduleInput
} from "./schedule.schemas.js";

//************************************************************** */

export async function scheduleRepairOrder(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: ScheduleRepairOrderInput,
) {
  const repairOrder =
    await getRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (
    repairOrder.status !==
    "READY_TO_WORK"
  ) {
    throw new AppError(
      400,
      "Repair order can only be scheduled when it is ready to work.",
      {
        code:
          "SCHEDULE_REPAIR_ORDER_INVALID_STATUS",
      },
    );
  }

  const schedule =
    await scheduleRepairOrderRecord(
      organizationId,
      repairOrderId,
      input.scheduledDate,
      membershipId,
      input.promisedDate,
      input.notes,
    );

  if (!schedule) {
    throw new AppError(
      400,
      "Repair order could not be scheduled.",
      {
        code:
          "SCHEDULE_REPAIR_ORDER_FAILED",
      },
    );
  }

  return schedule;
}

//************************************************************** */

export async function rescheduleRepairOrder(
  organizationId: string,
  repairOrderId: string,
  input: RescheduleRepairOrderInput,
) {
  const repairOrder =
    await getRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (
    repairOrder.status !==
    "SCHEDULED"
  ) {
    throw new AppError(
      400,
      "Repair order can only be rescheduled while it is currently scheduled.",
      {
        code:
          "RESCHEDULE_REPAIR_ORDER_INVALID_STATUS",
      },
    );
  }

  const schedule =
    await rescheduleRepairOrderRecord(
      organizationId,
      repairOrderId,
      input.scheduledDate,
      input.promisedDate,
      input.notes,
    );

  if (!schedule) {
    throw new AppError(
      404,
      "No existing schedule was found for this repair order.",
      {
        code:
          "REPAIR_ORDER_SCHEDULE_NOT_FOUND",
      },
    );
  }

  return schedule;
}

//************************************************************** */

export async function cancelRepairOrderSchedule(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: CancelScheduleInput,
) {
  const repairOrder =
    await getRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (
    repairOrder.status !==
    "SCHEDULED"
  ) {
    throw new AppError(
      400,
      "Repair order schedule can only be cancelled while the repair order is scheduled.",
      {
        code:
          "CANCEL_SCHEDULE_INVALID_STATUS",
      },
    );
  }

  const cancelledSchedule =
    await cancelRepairOrderScheduleRecord(
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
        code:
          "ACTIVE_SCHEDULE_NOT_FOUND",
      },
    );
  }

  return cancelledSchedule;
}