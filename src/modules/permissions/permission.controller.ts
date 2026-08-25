import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import { ok } from "../../platform/http/api-response.js";

import {
  getMembershipPermissions,
  updateMembershipPermissions,
  getPermissionCatalog,
} from "./permission.service.js";

import type { UpdateMembershipPermissionsInput } from "./permission.schemas.js";

import type { MembershipIdInput } from "../memberships/membership.schemas.js";

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

export async function getMembershipPermissionsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const params = requireValidatedParams<MembershipIdInput>(request);

  const permissions = await getMembershipPermissions(
    organizationId,
    params.membershipId,
  );

  ok(response, {
    permissions,
  });
}

//************************************************************** */

export async function updateMembershipPermissionsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const params = requireValidatedParams<MembershipIdInput>(request);

  const context = getRequestContext();

  if (!context.membership) {
    throw new AppError(403, "Organization membership is required.", {
      code: "ORGANIZATION_MEMBERSHIP_REQUIRED",
    });
  }

  const input = requireValidatedBody<UpdateMembershipPermissionsInput>(request);

  const permissions = await updateMembershipPermissions(
    organizationId,
    params.membershipId,
    {
      organizationId: context.membership.organizationId,
      membershipId: context.membership.id,
      role: context.membership.role,
    },
    input.permissions,
  );

  ok(response, {
    permissions,
  });
}

//************************************************************** */

export async function getPermissionCatalogHandler(
  _request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const catalog =
    getPermissionCatalog();

  ok(
    response,
    catalog,
  );
}

//************************************************************** */
