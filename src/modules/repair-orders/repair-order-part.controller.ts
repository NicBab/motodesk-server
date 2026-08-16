import type {
  Response,
} from "express";

import {
  AppError,
} from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import {
  created,
  ok,
} from "../../platform/http/api-response.js";

import {
  createRepairOrderPartLine,
  deleteRepairOrderPartLine,
  getRepairOrderPartLineById,
  listRepairOrderPartLines,
  updateRepairOrderPartLine,
} from "./repair-order-part.service.js";

import type {
  CreateRepairOrderPartLineInput,
  RepairOrderPartParamsInput,
  UpdateRepairOrderPartLineInput,
} from "./repair-order-part.schemas.js";

import type {
  RepairOrderIdInput,
} from "./repair-order.schemas.js";

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

export async function createRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    repairOrderId,
  } =
    requireValidatedParams<RepairOrderIdInput>(
      request,
    );

  const input =
    requireValidatedBody<CreateRepairOrderPartLineInput>(
      request,
    );

  const partLine =
    await createRepairOrderPartLine(
      organizationId,
      repairOrderId,
      input,
    );

  created(
    response,
    partLine,
  );
}

//************************************************************** */

export async function listRepairOrderPartLinesHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    repairOrderId,
  } =
    requireValidatedParams<RepairOrderIdInput>(
      request,
    );

  const partLines =
    await listRepairOrderPartLines(
      organizationId,
      repairOrderId,
    );

  ok(
    response,
    partLines,
  );
}

//************************************************************** */

export async function getRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    repairOrderId,
    partLineId,
  } =
    requireValidatedParams<RepairOrderPartParamsInput>(
      request,
    );

  const partLine =
    await getRepairOrderPartLineById(
      organizationId,
      repairOrderId,
      partLineId,
    );

  ok(
    response,
    partLine,
  );
}

//************************************************************** */

export async function updateRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    repairOrderId,
    partLineId,
  } =
    requireValidatedParams<RepairOrderPartParamsInput>(
      request,
    );

  const input =
    requireValidatedBody<UpdateRepairOrderPartLineInput>(
      request,
    );

  const partLine =
    await updateRepairOrderPartLine(
      organizationId,
      repairOrderId,
      partLineId,
      input,
    );

  ok(
    response,
    partLine,
  );
}

//************************************************************** */

export async function deleteRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    repairOrderId,
    partLineId,
  } =
    requireValidatedParams<RepairOrderPartParamsInput>(
      request,
    );

  await deleteRepairOrderPartLine(
    organizationId,
    repairOrderId,
    partLineId,
  );

  ok(
    response,
    {
      id:
        partLineId,
      deleted:
        true,
    },
  );
}