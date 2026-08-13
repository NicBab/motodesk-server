import type {
  Response,
} from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import {
  archiveVehicle,
  createVehicle,
  getVehicleById,
  listVehicles,
  updateVehicle,
} from "./vehicle.service.js";

import {
  created,
  ok,
} from "../../platform/http/api-response.js";

import type {
  CreateVehicleInput,
  ListVehiclesQueryInput,
  UpdateVehicleInput,
  VehicleIdInput,
} from "./vehicle.schemas.js";

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

export async function createVehicleHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const input =
    requireValidatedBody<CreateVehicleInput>(
      request,
    );

  const vehicle =
    await createVehicle(
      organizationId,
      input,
    );

  created(
    response,
    vehicle,
  );
}

//************************************************************** */

export async function listVehiclesHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const query =
    requireValidatedQuery<ListVehiclesQueryInput>(
      request,
    );

  const vehicles =
    await listVehicles(
      organizationId,
      query,
    );

  ok(
    response,
    vehicles,
  );
}

//************************************************************** */

export async function getVehicleHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    vehicleId,
  } =
    requireValidatedParams<VehicleIdInput>(
      request,
    );

  const vehicle =
    await getVehicleById(
      organizationId,
      vehicleId,
    );

  ok(
    response,
    vehicle,
  );
}

//************************************************************** */

export async function updateVehicleHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    vehicleId,
  } =
    requireValidatedParams<VehicleIdInput>(
      request,
    );

  const input =
    requireValidatedBody<UpdateVehicleInput>(
      request,
    );

  const vehicle =
    await updateVehicle(
      organizationId,
      vehicleId,
      input,
    );

  ok(
    response,
    vehicle,
  );
}

//************************************************************** */

export async function archiveVehicleHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    vehicleId,
  } =
    requireValidatedParams<VehicleIdInput>(
      request,
    );

  const vehicle =
    await archiveVehicle(
      organizationId,
      vehicleId,
    );

  ok(
    response,
    vehicle,
  );
}