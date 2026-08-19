import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import { ok } from "../../platform/http/api-response.js";

import {
  approveAdditionalWork,
  declineAdditionalWork,
  requestAdditionalWorkApproval,
} from "./repair-order-additional-approval.service.js";

import type {
  ApproveAdditionalWorkInput,
  DeclineAdditionalWorkInput,
  RequestAdditionalWorkApprovalInput,
} from "./repair-order-additional-approval.schemas.js";

//************************************************************** */

interface RepairOrderAdditionalApprovalParams {
  repairOrderId: string;
}

//************************************************************** */

function requireOrganizationId(request: AuthenticatedRequest): string {
  const organizationId = request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(400, "A valid organization ID is required.", {
      code: "ORGANIZATION_ID_REQUIRED",
    });
  }

  return organizationId;
}

//************************************************************** */
// Request Additional Work Approval

export async function requestAdditionalWorkApprovalHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<RepairOrderAdditionalApprovalParams>(request);

  const input =
    requireValidatedBody<RequestAdditionalWorkApprovalInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await requestAdditionalWorkApproval(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */
// Approve Additional Work

export async function approveAdditionalWorkHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<RepairOrderAdditionalApprovalParams>(request);

  const input = requireValidatedBody<ApproveAdditionalWorkInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await approveAdditionalWork(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */
// Decline Additional Work

export async function declineAdditionalWorkHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<RepairOrderAdditionalApprovalParams>(request);

  const input = requireValidatedBody<DeclineAdditionalWorkInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await declineAdditionalWork(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}
