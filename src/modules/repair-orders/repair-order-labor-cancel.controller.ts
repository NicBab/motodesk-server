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
  cancelRepairOrderLaborLine,
} from "./repair-order-labor-cancel.service.js";

import type {
  CancelRepairOrderLaborLineInput,
} from "./repair-order-labor-cancel.schemas.js";

//************************************************************** */

interface RepairOrderLaborCancelParams {
  repairOrderId: string;
  laborLineId: string;
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
// Cancel Proposed Labor Line

export async function cancelRepairOrderLaborLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    repairOrderId,
    laborLineId,
  } =
    requireValidatedParams<RepairOrderLaborCancelParams>(
      request,
    );

  const input =
    requireValidatedBody<CancelRepairOrderLaborLineInput>(
      request,
    );

  const membershipId =
    getRequestContext().membership?.id ??
    null;

  const laborLine =
    await cancelRepairOrderLaborLine(
      organizationId,
      repairOrderId,
      laborLineId,
      membershipId,
      input,
    );

  ok(
    response,
    laborLine,
  );
}