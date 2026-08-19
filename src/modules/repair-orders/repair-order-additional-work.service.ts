import { AppError } from "../../platform/errors/app-error.js";

import { getRepairOrderById } from "./repair-order.service.js";

import { sendAdditionalWorkToPartsReviewRecord } from "./repair-order-additional-work.repository.js";

import type { SendAdditionalWorkToPartsReviewInput } from "./repair-order-additional-work.schemas.js"

//************************************************************** */
// Send Additional Work To Parts Review

export async function sendAdditionalWorkToPartsReview(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: SendAdditionalWorkToPartsReviewInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  //************************************************************** */
  // Must Be Actively In Progress

  if (repairOrder.status !== "IN_PROGRESS") {
    throw new AppError(
      400,
      "Additional work can only be sent to parts review while the repair order is in progress.",
      {
        code: "REPAIR_ORDER_ADDITIONAL_WORK_INVALID_STATUS",
      },
    );
  }

  //************************************************************** */
  // Require At Least One Unresolved Blocking Part

  const unresolvedBlockingPart = repairOrder.partLines.find(
    (partLine) =>
      partLine.blocksWork === true &&
      (partLine.status === "NEEDS_REVIEW" ||
        partLine.status === "TO_BE_ORDERED" ||
        partLine.status === "ORDERED" ||
        partLine.status === "PARTIALLY_RECEIVED" ||
        partLine.status === "BACKORDERED"),
  );

  if (!unresolvedBlockingPart) {
    throw new AppError(
      400,
      "Repair order does not have unresolved blocking parts that require parts review.",
      {
        code: "REPAIR_ORDER_ADDITIONAL_WORK_NO_BLOCKING_PARTS",
      },
    );
  }

  //************************************************************** */
  // Send To Parts Review

  const updatedRepairOrder = await sendAdditionalWorkToPartsReviewRecord(
    organizationId,
    repairOrderId,
    repairOrder.status,
    membershipId,
    input.notes,
  );

  if (!updatedRepairOrder) {
    throw new AppError(
      400,
      "Repair order could not be returned to parts review.",
      {
        code: "REPAIR_ORDER_ADDITIONAL_WORK_PARTS_REVIEW_FAILED",
      },
    );
  }

  return updatedRepairOrder;
}
