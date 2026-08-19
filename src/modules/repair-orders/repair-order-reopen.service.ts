import { AppError } from "../../platform/errors/app-error.js";

import { getRepairOrderById } from "./repair-order.service.js";

import { reopenRepairOrderRecord } from "./repair-order-reopen.repository.js";

import type { ReopenRepairOrderInput } from "./repair-order-reopen.schemas.js";

//************************************************************** */
// Reopen Repair Order

export async function reopenRepairOrder(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: ReopenRepairOrderInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  //************************************************************** */
  // Financial / Terminal Locks

  if (
    repairOrder.status === "CASHIERED" ||
    repairOrder.status === "PICKED_UP" ||
    repairOrder.status === "CLOSED"
  ) {
    throw new AppError(400, "Repair order can no longer be reopened.", {
      code: "REPAIR_ORDER_REOPEN_LOCKED",
    });
  }

  //************************************************************** */
  // Cancelled Orders Require Separate Restoration

  if (repairOrder.status === "CANCELLED") {
    throw new AppError(400, "A cancelled repair order cannot be reopened.", {
      code: "REPAIR_ORDER_REOPEN_CANCELLED",
    });
  }

  //************************************************************** */
  // Already Actively Being Worked

  if (repairOrder.status === "IN_PROGRESS") {
    throw new AppError(400, "Repair order is already in progress.", {
      code: "REPAIR_ORDER_REOPEN_ALREADY_IN_PROGRESS",
    });
  }

  //************************************************************** */
  // Reopen

  const reopenedRepairOrder = await reopenRepairOrderRecord(
    organizationId,
    repairOrderId,
    repairOrder.status,
    membershipId,
    input.notes,
  );

  if (!reopenedRepairOrder) {
    throw new AppError(400, "Repair order could not be reopened.", {
      code: "REPAIR_ORDER_REOPEN_FAILED",
    });
  }

  return reopenedRepairOrder;
}
