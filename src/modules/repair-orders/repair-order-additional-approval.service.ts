import { AppError } from "../../platform/errors/app-error.js";

import { getRepairOrderById } from "./repair-order.service.js";

import {
  requestAdditionalWorkApprovalRecord,
  approveAdditionalWorkRecord,
  declineAdditionalWorkRecord,
} from "./repair-order-additional-approval.repository.js";

import type {
  RequestAdditionalWorkApprovalInput,
  ApproveAdditionalWorkInput,
  DeclineAdditionalWorkInput,
} from "./repair-order-additional-approval.schemas.js";

//************************************************************** */
// Request Additional Work Approval

export async function requestAdditionalWorkApproval(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: RequestAdditionalWorkApprovalInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "IN_PROGRESS") {
    throw new AppError(
      400,
      "Additional work approval can only be requested while the repair order is in progress.",
      {
        code: "REPAIR_ORDER_ADDITIONAL_APPROVAL_INVALID_STATUS",
      },
    );
  }

  const updatedRepairOrder = await requestAdditionalWorkApprovalRecord(
    organizationId,
    repairOrderId,
    repairOrder.status,
    membershipId,
    input.notes,
  );

  if (!updatedRepairOrder) {
    throw new AppError(
      400,
      "Additional work approval could not be requested.",
      {
        code: "REPAIR_ORDER_ADDITIONAL_APPROVAL_REQUEST_FAILED",
      },
    );
  }

  return updatedRepairOrder;
}

//************************************************************** */
// Approve Additional Work

export async function approveAdditionalWork(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: ApproveAdditionalWorkInput,
) {
  const repairOrder =
    await getRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (
    repairOrder.status !==
    "WAITING_ON_ADDITIONAL_APPROVAL"
  ) {
    throw new AppError(
      400,
      "Additional work can only be approved while awaiting additional customer approval.",
      {
        code:
          "REPAIR_ORDER_ADDITIONAL_APPROVAL_APPROVE_INVALID_STATUS",
      },
    );
  }

  const unresolvedBlockingPart =
    repairOrder.partLines.find(
      (partLine) =>
        partLine.blocksWork === true &&
        (
          partLine.status ===
            "NEEDS_REVIEW" ||
          partLine.status ===
            "TO_BE_ORDERED" ||
          partLine.status ===
            "ORDERED" ||
          partLine.status ===
            "PARTIALLY_RECEIVED" ||
          partLine.status ===
            "BACKORDERED"
        ),
    );

  const nextStatus =
    unresolvedBlockingPart
      ? "PARTS_REVIEW"
      : "IN_PROGRESS";

  const updatedRepairOrder =
    await approveAdditionalWorkRecord(
      organizationId,
      repairOrderId,
      nextStatus,
      membershipId,
      input.approvedBy,
      input.approvalMethod,
      input.approvedAmount,
      input.notes,
    );

  if (!updatedRepairOrder) {
    throw new AppError(
      400,
      "Additional work approval could not be applied.",
      {
        code:
          "REPAIR_ORDER_ADDITIONAL_APPROVAL_APPROVE_FAILED",
      },
    );
  }

  return updatedRepairOrder;
}

//************************************************************** */
// Decline Additional Work

export async function declineAdditionalWork(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: DeclineAdditionalWorkInput,
) {
  const repairOrder =
    await getRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (
    repairOrder.status !==
    "WAITING_ON_ADDITIONAL_APPROVAL"
  ) {
    throw new AppError(
      400,
      "Additional work can only be declined while awaiting additional customer approval.",
      {
        code:
          "REPAIR_ORDER_ADDITIONAL_APPROVAL_DECLINE_INVALID_STATUS",
      },
    );
  }

  const updatedRepairOrder =
    await declineAdditionalWorkRecord(
      organizationId,
      repairOrderId,
      membershipId,
      input.notes,
    );

  if (!updatedRepairOrder) {
    throw new AppError(
      400,
      "Additional work decline could not be applied.",
      {
        code:
          "REPAIR_ORDER_ADDITIONAL_APPROVAL_DECLINE_FAILED",
      },
    );
  }

  return updatedRepairOrder;
}
