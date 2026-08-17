import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import { created, ok } from "../../platform/http/api-response.js";

import {
  createRepairOrderLaborLine,
  deleteRepairOrderLaborLine,
  getRepairOrderLaborLineById,
  listRepairOrderLaborLines,
  updateRepairOrderLaborLine,
  startRepairOrderLaborLine,
  completeRepairOrderLaborLine
} from "./repair-order-labor.service.js";

import type {
  CreateRepairOrderLaborLineInput,
  RepairOrderLaborParamsInput,
  UpdateRepairOrderLaborLineInput,
  StartRepairOrderLaborLineInput,
  CompleteRepairOrderLaborLineInput
} from "./repair-order-labor.schemas.js";

import type { RepairOrderIdInput } from "./repair-order.schemas.js";

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

export async function createRepairOrderLaborLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<CreateRepairOrderLaborLineInput>(request);

  const laborLine = await createRepairOrderLaborLine(
    organizationId,
    repairOrderId,
    input,
  );

  created(response, laborLine);
}

//************************************************************** */

export async function listRepairOrderLaborLinesHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const laborLines = await listRepairOrderLaborLines(
    organizationId,
    repairOrderId,
  );

  ok(response, laborLines);
}

//************************************************************** */

export async function getRepairOrderLaborLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, laborLineId } =
    requireValidatedParams<RepairOrderLaborParamsInput>(request);

  const laborLine = await getRepairOrderLaborLineById(
    organizationId,
    repairOrderId,
    laborLineId,
  );

  ok(response, laborLine);
}

//************************************************************** */

export async function updateRepairOrderLaborLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, laborLineId } =
    requireValidatedParams<RepairOrderLaborParamsInput>(request);

  const input = requireValidatedBody<UpdateRepairOrderLaborLineInput>(request);

  const laborLine = await updateRepairOrderLaborLine(
    organizationId,
    repairOrderId,
    laborLineId,
    input,
  );

  ok(response, laborLine);
}

//************************************************************** */

export async function startRepairOrderLaborLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, laborLineId } =
    requireValidatedParams<RepairOrderLaborParamsInput>(request);

  const input = requireValidatedBody<StartRepairOrderLaborLineInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const laborLine = await startRepairOrderLaborLine(
    organizationId,
    repairOrderId,
    laborLineId,
    membershipId,
    input,
  );

  ok(response, laborLine);
}

//************************************************************** */

export async function completeRepairOrderLaborLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    repairOrderId,
    laborLineId,
  } =
    requireValidatedParams<RepairOrderLaborParamsInput>(
      request,
    );

  const input =
    requireValidatedBody<CompleteRepairOrderLaborLineInput>(
      request,
    );

  const membershipId =
    getRequestContext().membership?.id ??
    null;

  const laborLine =
    await completeRepairOrderLaborLine(
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

//************************************************************** */

export async function deleteRepairOrderLaborLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, laborLineId } =
    requireValidatedParams<RepairOrderLaborParamsInput>(request);

  await deleteRepairOrderLaborLine(organizationId, repairOrderId, laborLineId);

  ok(response, {
    id: laborLineId,
    deleted: true,
  });
}
