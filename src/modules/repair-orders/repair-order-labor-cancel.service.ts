import { AppError } from "../../platform/errors/app-error.js";

import {
  getRepairOrderById,
} from "./repair-order.service.js";

import {
  getRepairOrderLaborLineById,
} from "./repair-order-labor.service.js";

import {
  cancelRepairOrderLaborLineRecord,
} from "./repair-order-labor-cancel.repository.js";

import type {
  CancelRepairOrderLaborLineInput,
} from "./repair-order-labor-cancel.schemas.js";

//************************************************************** */
// Cancel Proposed Repair Order Labor Line

export async function cancelRepairOrderLaborLine(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
  membershipId: string | null,
  input: CancelRepairOrderLaborLineInput,
) {
  //************************************************************** */
  // Verify Repair Order

  await getRepairOrderById(
    organizationId,
    repairOrderId,
  );

  //************************************************************** */
  // Verify Labor Line

  const laborLine =
    await getRepairOrderLaborLineById(
      organizationId,
      repairOrderId,
      laborLineId,
    );

  //************************************************************** */
  // Only Proposed Labor Can Be Cancelled

  if (
    laborLine.status !==
    "PROPOSED"
  ) {
    throw new AppError(
      400,
      "Only proposed labor can be cancelled.",
      {
        code:
          "REPAIR_ORDER_LABOR_CANCEL_INVALID_STATUS",
      },
    );
  }

  //************************************************************** */
  // Started Labor Cannot Be Cancelled As Proposed Work

  if (
    laborLine.startedAt !==
    null
  ) {
    throw new AppError(
      400,
      "Started labor cannot be cancelled as proposed work.",
      {
        code:
          "REPAIR_ORDER_LABOR_CANCEL_ALREADY_STARTED",
      },
    );
  }

  //************************************************************** */
  // Cancel Labor + Persist Audit Record

  const cancelledLaborLine =
    await cancelRepairOrderLaborLineRecord(
      organizationId,
      repairOrderId,
      laborLineId,
      membershipId,
      input.notes,
    );

  if (!cancelledLaborLine) {
    throw new AppError(
      400,
      "Repair order labor could not be cancelled.",
      {
        code:
          "REPAIR_ORDER_LABOR_CANCEL_FAILED",
      },
    );
  }

  return cancelledLaborLine;
}