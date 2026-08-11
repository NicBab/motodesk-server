import type { Request, Response } from "express";

import { ok } from "../../../../platform/http/api-response.js";

import { requireValidatedBody } from "../../../../platform/validation/validated-request.js";

import { getRequestMetadata } from "../../../../platform/request/request.metadata.js";

import { setAuthenticationCookies } from "../../cookie.service.js";

import type { RefreshSessionInput } from "./schema.js";

import { refreshSession } from "./service.js";

import { getPermissionsForRole } from "../../../permissions/permission.utils.js";

//************************************************************** */

export async function refresh(
  request: Request,
  response: Response,
): Promise<void> {
  const input = requireValidatedBody<RefreshSessionInput>(request);

  const result = await refreshSession(input, getRequestMetadata(request));

  setAuthenticationCookies(response, result.accessToken, result.refreshToken);

  const permissions = result.membership
    ? getPermissionsForRole(result.membership.role)
    : [];

  ok(response, {
    user: result.user,
    membership: result.membership,
    permissions,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}

//************************************************************** */
