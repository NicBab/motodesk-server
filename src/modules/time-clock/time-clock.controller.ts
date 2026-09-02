import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import { created, ok } from "../../platform/http/api-response.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery
} from "../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import {
  clockEmployeeIn,
  clockEmployeeOut,
  correctTimeEntry,
  createManualTimeEntry,
  getCurrentlyClockedIn,
  getEmployeeClockStatus,
  getEmployeeTimeHistory,
  getTimeClockReport,
} from "./time-clock.service.js";

import type {
  CorrectTimeEntryInput,
  CreateManualTimeEntryInput,
  TimeClockActionInput,
  TimeClockEmployeeParamsInput,
  TimeClockEntryParamsInput,
  TimeClockReportQueryInput,
} from "./time-clock.schemas.js";

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

function getManagerContext() {
  const context = getRequestContext();

  const name =
    [context.user.firstName, context.user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

  return {
    membershipId: context.membership?.id ?? null,

    name,
  };
}

//************************************************************** */

export async function getTimeClockStatusHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { employeeId } =
    requireValidatedParams<TimeClockEmployeeParamsInput>(request);

  ok(response, await getEmployeeClockStatus(organizationId, employeeId));
}

//************************************************************** */

export async function getCurrentlyClockedInHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  ok(response, await getCurrentlyClockedIn(requireOrganizationId(request)));
}

//************************************************************** */

export async function clockEmployeeInHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { employeeId } =
    requireValidatedParams<TimeClockEmployeeParamsInput>(request);

  const { pin } = requireValidatedBody<TimeClockActionInput>(request);

  created(response, await clockEmployeeIn(organizationId, employeeId, pin));
}

//************************************************************** */

export async function clockEmployeeOutHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { employeeId } =
    requireValidatedParams<TimeClockEmployeeParamsInput>(request);

  const { pin } = requireValidatedBody<TimeClockActionInput>(request);

  ok(response, await clockEmployeeOut(organizationId, employeeId, pin));
}

//************************************************************** */

export async function createManualTimeEntryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const input = requireValidatedBody<CreateManualTimeEntryInput>(request);

  created(
    response,
    await createManualTimeEntry(
      requireOrganizationId(request),
      input,
      getManagerContext(),
    ),
  );
}

//************************************************************** */

export async function correctTimeEntryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const { timeEntryId } =
    requireValidatedParams<TimeClockEntryParamsInput>(request);

  const input = requireValidatedBody<CorrectTimeEntryInput>(request);

  ok(
    response,
    await correctTimeEntry(
      requireOrganizationId(request),
      timeEntryId,
      input,
      getManagerContext(),
    ),
  );
}

//************************************************************** */

export async function getEmployeeTimeHistoryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { employeeId } =
    requireValidatedParams<TimeClockEmployeeParamsInput>(request);

  ok(response, await getEmployeeTimeHistory(organizationId, employeeId));
}

//************************************************************** */

export async function getTimeClockReportHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(
      request,
    );

  const query =
    requireValidatedQuery<TimeClockReportQueryInput>(
      request,
    );

  const report =
    await getTimeClockReport(
      organizationId,
      query,
    );

  ok(
    response,
    report,
  );
}

//************************************************************** */
