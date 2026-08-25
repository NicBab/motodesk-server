import type { Response } from "express";
import { AppError } from "../../platform/errors/app-error.js";
import type { AuthenticatedRequest } from "../auth/index.js";
import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";
import type {
  CreateOrganizationRequest,
  OrganizationIdInput,
  UpdateOrganizationRequest,
} from "./organization.schemas.js";

import {
  createOrganization,
  getOrganizationById,
  getOrganizationsForUser,
  updateOrganization,
  archiveOrganization
} from "./organization.service.js";

import {
  created,
  list as listResponse,
  ok,
} from "../../platform/http/api-response.js";



//************************************************************** */
// function requireAuthenticatedUserId(
//   request: AuthenticatedRequest,
// ): string {
//   const userId = request.authenticatedUser?.id;

//   if (!userId) {
//     throw new AppError(
//       401,
//       "Authentication required.",
//       {
//         code: "AUTHENTICATION_REQUIRED",
//       },
//     );
//   }

//   return userId;
// }

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

export async function createOrganizationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const context = getRequestContext();

  const body =
    requireValidatedBody<CreateOrganizationRequest>(
      request,
    );

  const organization =
    await createOrganization({
      name: body.name,
      slug: body.slug,
      ownerUserId: context.user.id,

      ...(body.email !== undefined
        ? { email: body.email }
        : {}),

      ...(body.phone !== undefined
        ? { phone: body.phone }
        : {}),
    });

  created(response, organization);
}

//************************************************************** */

export async function getMyOrganizationsHandler(
  _request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const context = getRequestContext();

  const memberships = await getOrganizationsForUser(context.user.id);

  listResponse(response, memberships);
}

//************************************************************** */

export async function getOrganizationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const params =
    requireValidatedParams<OrganizationIdInput>(
      request,
    );

  const organization =
    await getOrganizationById(
      params.organizationId,
    );

  ok(response, organization);
}

//************************************************************** */

export async function updateOrganizationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const context = getRequestContext();

  const params =
    requireValidatedParams<OrganizationIdInput>(
      request,
    );

  const body =
    requireValidatedBody<UpdateOrganizationRequest>(
      request,
    );

  const organization =
    await updateOrganization(
      params.organizationId,
      {
        ...(body.name !== undefined
          ? { name: body.name }
          : {}),

        ...(body.email !== undefined
          ? { email: body.email }
          : {}),

        ...(body.phone !== undefined
          ? { phone: body.phone }
          : {}),
      },
      context.user.id,
    );

  ok(response, organization);
}

//************************************************************** */

export async function archiveOrganizationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(
      request,
    );

  const user =
    request.authenticatedUser;

  if (!user) {
    throw new AppError(
      401,
      "Authentication required.",
      {
        code:
          "AUTHENTICATION_REQUIRED",
      },
    );
  }

  const organization =
    await archiveOrganization(
      organizationId,
      user.id,
    );

  ok(
    response,
    organization,
  );
}

//************************************************************** */
