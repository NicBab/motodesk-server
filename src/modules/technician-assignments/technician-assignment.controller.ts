import type { Response } from "express";

import type { AuthenticatedRequest } from "../auth/index.js";

import { AppError } from "../../platform/errors/app-error.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import { ok } from "../../platform/http/api-response.js";

import { assignTechnician } from "./technician-assignment.service.js";

import type { AssignTechnicianInput } from "./technician-assignment.schemas.js";

//************************************************************** */

interface TechnicianAssignmentParams {
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

export async function assignTechnicianHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<TechnicianAssignmentParams>(request);

  const input = requireValidatedBody<AssignTechnicianInput>(request);

  const assignedByMembershipId = getRequestContext().membership?.id ?? null;

  const assignment = await assignTechnician(
    organizationId,
    repairOrderId,
    assignedByMembershipId,
    input,
  );

  ok(response, assignment);
}
