import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import { ok } from "../../platform/http/api-response.js";

import { sendAdditionalWorkToPartsReview } from "./repair-order-additional-work.service.js";

import type { SendAdditionalWorkToPartsReviewInput } from "./repair-order-additional-work.schemas.js";

//************************************************************** */

interface RepairOrderAdditionalWorkParams {
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
// Send Additional Work To Parts Review

export async function sendAdditionalWorkToPartsReviewHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<RepairOrderAdditionalWorkParams>(request);

  const input =
    requireValidatedBody<SendAdditionalWorkToPartsReviewInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await sendAdditionalWorkToPartsReview(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}
