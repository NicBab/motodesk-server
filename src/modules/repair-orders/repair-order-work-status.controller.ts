import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import { ok } from "../../platform/http/api-response.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import {
  pauseRepairOrderWork,
  resumeRepairOrderWork,
} from "./repair-order-work-status.service.js";

import type {
  PauseRepairOrderWorkInput,
  ResumeRepairOrderWorkInput,
} from "./repair-order-work-status.schemas.js";

//************************************************************** */

interface RepairOrderWorkStatusParams {
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
// Pause Repair Order Work

export async function pauseRepairOrderWorkHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<RepairOrderWorkStatusParams>(request);

  const input = requireValidatedBody<PauseRepairOrderWorkInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await pauseRepairOrderWork(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */
// Resume Repair Order Work

export async function resumeRepairOrderWorkHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<RepairOrderWorkStatusParams>(request);

  const input = requireValidatedBody<ResumeRepairOrderWorkInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await resumeRepairOrderWork(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}
