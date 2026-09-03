import type { Response } from "express";

import { ok } from "../../platform/http/api-response.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import type {
  CancelScheduleInput,
  RescheduleRepairOrderInput,
  ScheduleBoardQueryInput,
  ScheduleRepairOrderInput,
} from "./schedule.schemas.js";

import {
  cancelRepairOrderSchedule,
  getScheduleBoard,
  rescheduleRepairOrder,
  scheduleRepairOrder,
} from "./schedule.service.js";

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
// Dispatch Board

export async function getScheduleBoardHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query = requireValidatedQuery<ScheduleBoardQueryInput>(request);

  const board = await getScheduleBoard(organizationId, query);

  ok(response, board);
}

//************************************************************** */
// Schedule Repair Order

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
// Reschedule Repair Order

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
// Cancel Repair Order Schedule

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

//************************************************************** */
