import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import { created, ok } from "../../platform/http/api-response.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import {
  archivePartReturn,
  closePartReturn,
  createPartReturn,
  getPartReturnById,
  listPartReturns,
  shipPartReturn,
  updatePartReturn,
  updatePartReturnCredit,
} from "./part-return.service.js";

import type {
  CreatePartReturnInput,
  ListPartReturnsQueryInput,
  PartReturnIdInput,
  UpdatePartReturnCreditInput,
  UpdatePartReturnInput,
} from "./part-return.schemas.js";

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

export async function createPartReturnHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const input = requireValidatedBody<CreatePartReturnInput>(request);

  const partReturn = await createPartReturn(organizationId, input);

  created(response, partReturn);
}

//************************************************************** */

export async function listPartReturnsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query = requireValidatedQuery<ListPartReturnsQueryInput>(request);

  const partReturns = await listPartReturns(organizationId, query);

  ok(response, partReturns);
}

//************************************************************** */

export async function getPartReturnHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { partReturnId } = requireValidatedParams<PartReturnIdInput>(request);

  const partReturn = await getPartReturnById(organizationId, partReturnId);

  ok(response, partReturn);
}

//************************************************************** */

export async function updatePartReturnHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { partReturnId } = requireValidatedParams<PartReturnIdInput>(request);

  const input = requireValidatedBody<UpdatePartReturnInput>(request);

  const partReturn = await updatePartReturn(
    organizationId,
    partReturnId,
    input,
  );

  ok(response, partReturn);
}

//************************************************************** */

export async function shipPartReturnHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { partReturnId } = requireValidatedParams<PartReturnIdInput>(request);

  const partReturn = await shipPartReturn(organizationId, partReturnId);

  ok(response, partReturn);
}

//************************************************************** */

export async function updatePartReturnCreditHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { partReturnId } = requireValidatedParams<PartReturnIdInput>(request);

  const input = requireValidatedBody<UpdatePartReturnCreditInput>(request);

  const partReturn = await updatePartReturnCredit(
    organizationId,
    partReturnId,
    input,
  );

  ok(response, partReturn);
}

//************************************************************** */

export async function closePartReturnHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { partReturnId } = requireValidatedParams<PartReturnIdInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const partReturn = await closePartReturn(
    organizationId,
    partReturnId,
    membershipId,
  );

  ok(response, partReturn);
}

//************************************************************** */

export async function archivePartReturnHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { partReturnId } = requireValidatedParams<PartReturnIdInput>(request);

  const partReturn = await archivePartReturn(organizationId, partReturnId);

  ok(response, partReturn);
}

//************************************************************** */
