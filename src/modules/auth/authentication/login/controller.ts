import type { Request, Response } from "express";

import { setAuthenticationCookies } from "../../cookie.service.js";

import { loginUser } from "./service.js";

import type { LoginInput } from "./schema.js";

import { requireValidatedBody } from "../../../../platform/validation/validated-request.js";

import { ok } from "../../../../platform/http/api-response.js";

import { getPermissionsForRole } from "../../../permissions/permission.utils.js";

import { getRequestMetadata } from "../../../../platform/request/request.metadata.js";

//************************************************************** */

export async function login(
  request: Request,
  response: Response,
): Promise<void> {
  const input = requireValidatedBody<LoginInput>(request);

  const result = await loginUser(input, getRequestMetadata(request));

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
