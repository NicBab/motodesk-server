import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import {
  getRequestContext,
} from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import {
  ok,
} from "../../platform/http/api-response.js";

import {
  cancelRepairOrderPartLine,
} from "./repair-order-part-cancel.service.js";

import type {
  CancelRepairOrderPartLineInput,
} from "./repair-order-part-cancel.schemas.js";

//************************************************************** */

interface RepairOrderPartCancelParams {
  repairOrderId: string;
  partLineId: string;
}

//************************************************************** */

function requireOrganizationId(
  request: AuthenticatedRequest,
): string {
  const organizationId =
    request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(
      400,
      "A valid organization ID is required.",
      {
        code:
          "ORGANIZATION_ID_REQUIRED",
      },
    );
  }

  return organizationId;
}

//************************************************************** */
// Cancel Proposed Part Line

export async function cancelRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    repairOrderId,
    partLineId,
  } =
    requireValidatedParams<RepairOrderPartCancelParams>(
      request,
    );

  const input =
    requireValidatedBody<CancelRepairOrderPartLineInput>(
      request,
    );

  const membershipId =
    getRequestContext().membership?.id ??
    null;

  const partLine =
    await cancelRepairOrderPartLine(
      organizationId,
      repairOrderId,
      partLineId,
      membershipId,
      input,
    );

  ok(
    response,
    partLine,
  );
}