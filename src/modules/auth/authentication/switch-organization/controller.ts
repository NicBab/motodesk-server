import type { Response } from "express";

import { ok } from "../../../../platform/http/api-response.js";

import { AppError } from "../../../../platform/errors/app-error.js";

import { requireValidatedBody } from "../../../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../../auth.middleware.js";

import type { SwitchOrganizationInput } from "./schema.js";

import { switchOrganization } from "./service.js";

import { setAccessTokenCookie } from "../../cookie.service.js";

import { getPermissionsForRole } from "../../../permissions/permission.utils.js";

//************************************************************** */

export async function switchOrganizationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  const sessionId = request.authenticationSessionId;

  if (!userId || !sessionId) {
    throw new AppError(401, "Authentication required.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const input = requireValidatedBody<SwitchOrganizationInput>(request);

  const result = await switchOrganization(userId, sessionId, input);

  setAccessTokenCookie(response, result.accessToken);

  const permissions = getPermissionsForRole(result.membership.role);

  ok(response, {
    membership: result.membership,
    permissions,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
  });
}

//************************************************************** */
