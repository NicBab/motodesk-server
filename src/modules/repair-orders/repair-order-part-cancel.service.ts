import { AppError } from "../../platform/errors/app-error.js";

import { getRepairOrderById } from "./repair-order.service.js";

import { getRepairOrderPartLineById } from "./repair-order-part.service.js";

import { cancelRepairOrderPartLineRecord } from "./repair-order-part-cancel.repository.js";

import type { CancelRepairOrderPartLineInput } from "./repair-order-part-cancel.schemas.js";

//************************************************************** */
// Cancel Proposed Repair Order Part Line

export async function cancelRepairOrderPartLine(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  membershipId: string | null,
  input: CancelRepairOrderPartLineInput,
) {
  //************************************************************** */
  // Verify Repair Order

  await getRepairOrderById(organizationId, repairOrderId);

  //************************************************************** */
  // Verify Part Line

  const partLine = await getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );

  //************************************************************** */
  // Only Untouched Proposed Parts Can Be Cancelled

  const cancellableStatuses = ["NEEDS_REVIEW", "TO_BE_ORDERED"] as const;

  if (!cancellableStatuses.some((status) => status === partLine.status)) {
    throw new AppError(
      400,
      "Only proposed parts that have not entered inventory or purchasing workflow can be cancelled.",
      {
        code: "REPAIR_ORDER_PART_CANCEL_INVALID_STATUS",
      },
    );
  }

  //************************************************************** */
  // Defensive Quantity Guards
  //
  // Even if status somehow became stale, do not allow simple
  // cancellation after inventory or purchasing activity occurred.

  const allocatedQty = Number(partLine.allocatedQty.toString());

  const orderedQty = Number(partLine.orderedQty.toString());

  const receivedQty = Number(partLine.receivedQty.toString());

  const pulledQty = Number(partLine.pulledQty.toString());

  const installedQty = Number(partLine.installedQty.toString());

  if (
    allocatedQty > 0 ||
    orderedQty > 0 ||
    receivedQty > 0 ||
    pulledQty > 0 ||
    installedQty > 0
  ) {
    throw new AppError(
      400,
      "A part with inventory or purchasing activity cannot be cancelled as proposed work.",
      {
        code: "REPAIR_ORDER_PART_CANCEL_HAS_ACTIVITY",
      },
    );
  }

  //************************************************************** */
  // Cancel Part

  const cancelledPartLine = await cancelRepairOrderPartLineRecord(
    organizationId,
    repairOrderId,
    partLineId,
    membershipId,
    input.notes,
  );

  if (!cancelledPartLine) {
    throw new AppError(400, "Repair order part could not be cancelled.", {
      code: "REPAIR_ORDER_PART_CANCEL_FAILED",
    });
  }

  return cancelledPartLine;
}
