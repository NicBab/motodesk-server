import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import { created, ok } from "../../platform/http/api-response.js";

import {
  allocateRepairOrderPartLine,
  createRepairOrderPartLine,
  deleteRepairOrderPartLine,
  getRepairOrderPartLineById,
  listRepairOrderPartLines,
  updateRepairOrderPartLine,
  deallocateRepairOrderPartLine,
  issueRepairOrderPartLine,
  installRepairOrderPartLine,
  markRepairOrderPartToBeOrdered,
  pullRepairOrderPart,
  stageRepairOrderPart,
} from "./repair-order-part.service.js";

import type {
  CreateRepairOrderPartLineInput,
  RepairOrderPartParamsInput,
  UpdateRepairOrderPartLineInput,
  DeallocateRepairOrderPartInput,
} from "./repair-order-part.schemas.js";

import type { RepairOrderIdInput } from "./repair-order.schemas.js";

import type {
  AllocateRepairOrderPartInput,
  IssueRepairOrderPartInput,
  InstallRepairOrderPartInput,
  MarkRepairOrderPartToBeOrderedInput,
  PullRepairOrderPartInput,
  StageRepairOrderPartInput,
} from "./repair-order-part.schemas.js";

import { getRequestContext } from "../../platform/request/request.context.js";

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

export async function createRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<CreateRepairOrderPartLineInput>(request);

  const partLine = await createRepairOrderPartLine(
    organizationId,
    repairOrderId,
    input,
  );

  created(response, partLine);
}

//************************************************************** */

export async function listRepairOrderPartLinesHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const partLines = await listRepairOrderPartLines(
    organizationId,
    repairOrderId,
  );

  ok(response, partLines);
}

//************************************************************** */

export async function getRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  const partLine = await getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );

  ok(response, partLine);
}

//************************************************************** */

export async function updateRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  const input = requireValidatedBody<UpdateRepairOrderPartLineInput>(request);

  const partLine = await updateRepairOrderPartLine(
    organizationId,
    repairOrderId,
    partLineId,
    input,
  );

  ok(response, partLine);
}

//************************************************************** */

export async function allocateRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  const input = requireValidatedBody<AllocateRepairOrderPartInput>(request);

  const partLine = await allocateRepairOrderPartLine(
    organizationId,
    repairOrderId,
    partLineId,
    getRequestContext().membership?.id ?? null,
    input,
  );

  ok(response, partLine);
}

//************************************************************** */

export async function deallocateRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  const input = requireValidatedBody<DeallocateRepairOrderPartInput>(request);

  const partLine = await deallocateRepairOrderPartLine(
    organizationId,
    repairOrderId,
    partLineId,
    getRequestContext().membership?.id ?? null,
    input,
  );

  ok(response, partLine);
}

//************************************************************** */

export async function issueRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  const input = requireValidatedBody<IssueRepairOrderPartInput>(request);

  const partLine = await issueRepairOrderPartLine(
    organizationId,
    repairOrderId,
    partLineId,
    getRequestContext().membership?.id ?? null,
    input,
  );

  ok(response, partLine);
}

//************************************************************** */

export async function installRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  const input = requireValidatedBody<InstallRepairOrderPartInput>(request);

  const partLine = await installRepairOrderPartLine(
    organizationId,
    repairOrderId,
    partLineId,
    input,
  );

  ok(response, partLine);
}

//************************************************************** */

export async function markRepairOrderPartToBeOrderedHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  const input =
    requireValidatedBody<MarkRepairOrderPartToBeOrderedInput>(request);

  const partLine = await markRepairOrderPartToBeOrdered(
    organizationId,
    repairOrderId,
    partLineId,
    input,
  );

  ok(response, partLine);
}

//************************************************************** */

export async function pullRepairOrderPartHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  const input = requireValidatedBody<PullRepairOrderPartInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const partLine = await pullRepairOrderPart(
    organizationId,
    repairOrderId,
    partLineId,
    membershipId,
    input,
  );

  ok(response, partLine);
}

//************************************************************** */

export async function stageRepairOrderPartHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  const input = requireValidatedBody<StageRepairOrderPartInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const partLine = await stageRepairOrderPart(
    organizationId,
    repairOrderId,
    partLineId,
    membershipId,
    input,
  );

  ok(response, partLine);
}

//************************************************************** */

export async function deleteRepairOrderPartLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId, partLineId } =
    requireValidatedParams<RepairOrderPartParamsInput>(request);

  await deleteRepairOrderPartLine(organizationId, repairOrderId, partLineId);

  ok(response, {
    id: partLineId,
    deleted: true,
  });
}
