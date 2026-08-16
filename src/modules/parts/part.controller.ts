import type {
  Response,
} from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import {
  getRequestContext,
} from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import {
  created,
  ok,
} from "../../platform/http/api-response.js";

import {
  archivePart,
  createPart,
  getPartById,
  listParts,
  updatePart,
} from "./part.service.js";

import type {
  CreatePartInput,
  ListPartsQueryInput,
  PartIdInput,
  UpdatePartInput,
} from "./part.schemas.js";

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

function getMembershipId(): string | null {
  const context =
    getRequestContext();

  return (
    context.membership?.id ??
    null
  );
}

//************************************************************** */

export async function createPartHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const membershipId =
    getMembershipId();

  const input =
    requireValidatedBody<CreatePartInput>(
      request,
    );

  const part =
    await createPart(
      organizationId,
      membershipId,
      input,
    );

  created(
    response,
    part,
  );
}

//************************************************************** */

export async function listPartsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const query =
    requireValidatedQuery<ListPartsQueryInput>(
      request,
    );

  const parts =
    await listParts(
      organizationId,
      query,
    );

  ok(
    response,
    parts,
  );
}

//************************************************************** */

export async function getPartHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    partId,
  } =
    requireValidatedParams<PartIdInput>(
      request,
    );

  const part =
    await getPartById(
      organizationId,
      partId,
    );

  ok(
    response,
    part,
  );
}

//************************************************************** */

export async function updatePartHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    partId,
  } =
    requireValidatedParams<PartIdInput>(
      request,
    );

  const input =
    requireValidatedBody<UpdatePartInput>(
      request,
    );

  const part =
    await updatePart(
      organizationId,
      partId,
      input,
    );

  ok(
    response,
    part,
  );
}

//************************************************************** */

export async function archivePartHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    partId,
  } =
    requireValidatedParams<PartIdInput>(
      request,
    );

  const part =
    await archivePart(
      organizationId,
      partId,
    );

  ok(
    response,
    part,
  );
}