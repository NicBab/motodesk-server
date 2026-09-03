import type {
  Response,
} from "express";

import {
  created,
  ok,
} from "../../platform/http/api-response.js";

import {
  AppError,
} from "../../platform/errors/app-error.js";

import {
  getRequestContext,
} from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import type {
  CancelServiceAppointmentInput,
  CreateServiceAppointmentInput,
  ListServiceAppointmentsQueryInput,
  ServiceAppointmentIdInput,
} from "./service-appointment.schemas.js";

import {
  cancelServiceAppointment,
  checkInServiceAppointment,
  confirmServiceAppointment,
  convertServiceAppointmentToRepairOrder,
  createServiceAppointment,
  getServiceAppointmentById,
  listServiceAppointments,
} from "./service-appointment.service.js";

//************************************************************** */

function requireOrganizationId(
  request: AuthenticatedRequest,
): string {
  const organizationId =
    request.params.organizationId;

  if (
    typeof organizationId !==
      "string" ||
    organizationId.trim().length ===
      0
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

export async function listServiceAppointmentsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(
      request,
    );

  const query =
    requireValidatedQuery<ListServiceAppointmentsQueryInput>(
      request,
    );

  const appointments =
    await listServiceAppointments(
      organizationId,
      query,
    );

  ok(
    response,
    appointments,
  );
}

//************************************************************** */

export async function getServiceAppointmentHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(
      request,
    );

  const {
    appointmentId,
  } =
    requireValidatedParams<ServiceAppointmentIdInput>(
      request,
    );

  const appointment =
    await getServiceAppointmentById(
      organizationId,
      appointmentId,
    );

  ok(
    response,
    appointment,
  );
}

//************************************************************** */

export async function createServiceAppointmentHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(
      request,
    );

  const input =
    requireValidatedBody<CreateServiceAppointmentInput>(
      request,
    );

  const appointment =
    await createServiceAppointment(
      organizationId,
      input,
    );

  created(
    response,
    appointment,
  );
}

//************************************************************** */

export async function confirmServiceAppointmentHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(
      request,
    );

  const {
    appointmentId,
  } =
    requireValidatedParams<ServiceAppointmentIdInput>(
      request,
    );

  const appointment =
    await confirmServiceAppointment(
      organizationId,
      appointmentId,
    );

  ok(
    response,
    appointment,
  );
}

//************************************************************** */

export async function checkInServiceAppointmentHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(
      request,
    );

  const {
    appointmentId,
  } =
    requireValidatedParams<ServiceAppointmentIdInput>(
      request,
    );

  const appointment =
    await checkInServiceAppointment(
      organizationId,
      appointmentId,
    );

  ok(
    response,
    appointment,
  );
}

//************************************************************** */

export async function cancelServiceAppointmentHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(
      request,
    );

  const {
    appointmentId,
  } =
    requireValidatedParams<ServiceAppointmentIdInput>(
      request,
    );

  const input =
    requireValidatedBody<CancelServiceAppointmentInput>(
      request,
    );

  const appointment =
    await cancelServiceAppointment(
      organizationId,
      appointmentId,
      input,
    );

  ok(
    response,
    appointment,
  );
}

//************************************************************** */

export async function convertServiceAppointmentToRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(
      request,
    );

  const {
    appointmentId,
  } =
    requireValidatedParams<ServiceAppointmentIdInput>(
      request,
    );

  const membershipId =
    getRequestContext()
      .membership
      ?.id ??
    null;

  const result =
    await convertServiceAppointmentToRepairOrder(
      organizationId,
      appointmentId,
      membershipId,
    );

  created(
    response,
    result,
  );
}

//************************************************************** */