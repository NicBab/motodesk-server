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
  scheduleRepairOrder,
  rescheduleRepairOrder,
  cancelRepairOrderSchedule,
} from "./schedule.service.js";

import type {
  ScheduleRepairOrderInput,
  RescheduleRepairOrderInput,
  CancelScheduleInput,
} from "./schedule.schemas.js";

//************************************************************** */

interface ScheduleRepairOrderParams {
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

export async function scheduleRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<ScheduleRepairOrderParams>(request);

  const input = requireValidatedBody<ScheduleRepairOrderInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const schedule = await scheduleRepairOrder(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, schedule);
}

//************************************************************** */

export async function rescheduleRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<ScheduleRepairOrderParams>(request);

  const input = requireValidatedBody<RescheduleRepairOrderInput>(request);

  const schedule = await rescheduleRepairOrder(
    organizationId,
    repairOrderId,
    input,
  );

  ok(response, schedule);
}

//************************************************************** */

export async function cancelRepairOrderScheduleHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<ScheduleRepairOrderParams>(request);

  const input = requireValidatedBody<CancelScheduleInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const cancelledSchedule = await cancelRepairOrderSchedule(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, cancelledSchedule);
}
