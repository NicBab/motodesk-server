import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import { ok } from "../../platform/http/api-response.js";

import { reopenRepairOrder } from "./repair-order-reopen.service.js";

import type { ReopenRepairOrderInput } from "./repair-order-reopen.schemas.js";

//************************************************************** */

interface RepairOrderReopenParams {
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
// Reopen Repair Order

export async function reopenRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<RepairOrderReopenParams>(request);

  const input = requireValidatedBody<ReopenRepairOrderInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await reopenRepairOrder(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}
