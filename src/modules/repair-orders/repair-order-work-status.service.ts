import { AppError } from "../../platform/errors/app-error.js";

import {
  getRepairOrderById,
  updateRepairOrderStatus,
} from "./repair-order.service.js";

import type {
  PauseRepairOrderWorkInput,
  ResumeRepairOrderWorkInput,
} from "./repair-order-work-status.schemas.js";

//************************************************************** */
// Pause Repair Order Work

export async function pauseRepairOrderWork(
  organizationId: string,
  repairOrderId: string,
  changedByMembershipId: string | null,
  input: PauseRepairOrderWorkInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "IN_PROGRESS") {
    throw new AppError(400, "Only an in-progress repair order can be paused.", {
      code: "REPAIR_ORDER_PAUSE_INVALID_STATUS",
    });
  }

  return updateRepairOrderStatus(
    organizationId,
    repairOrderId,
    changedByMembershipId,
    {
      status: "PAUSED",

      notes: input.notes,

      automatic: false,
    },
  );
}

//************************************************************** */
// Resume Repair Order Work

export async function resumeRepairOrderWork(
  organizationId: string,
  repairOrderId: string,
  changedByMembershipId: string | null,
  input: ResumeRepairOrderWorkInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "PAUSED") {
    throw new AppError(400, "Only a paused repair order can be resumed.", {
      code: "REPAIR_ORDER_RESUME_INVALID_STATUS",
    });
  }

  return updateRepairOrderStatus(
    organizationId,
    repairOrderId,
    changedByMembershipId,
    {
      status: "IN_PROGRESS",

      notes: input.notes ?? "Repair order work resumed.",

      automatic: false,
    },
  );
}
