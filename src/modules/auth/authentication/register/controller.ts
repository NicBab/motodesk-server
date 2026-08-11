import type { Request, Response } from "express";

import { created } from "../../../../platform/http/api-response.js";

import { requireValidatedBody } from "../../../../platform/validation/validated-request.js";

import { setAuthenticationCookies } from "../../cookie.service.js";

import { getPermissionsForRole } from "../../../permissions/permission.utils.js";

import type { RegisterInput } from "./schema.js";

import { registerUser } from "./service.js";

import { getRequestMetadata } from "../../../../platform/request/request.metadata.js";

//************************************************************** */

export async function register(
  request: Request,
  response: Response,
): Promise<void> {
  const input = requireValidatedBody<RegisterInput>(request);

  const result = await registerUser(input, getRequestMetadata(request));
  setAuthenticationCookies(response, result.accessToken, result.refreshToken);

  const permissions = result.membership
    ? getPermissionsForRole(result.membership.role)
    : [];

  created(response, {
    user: result.user,
    membership: result.membership,
    permissions,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,

    ...(result.emailVerificationToken !== undefined
      ? {
          emailVerificationToken: result.emailVerificationToken,
        }
      : {}),

    ...(result.emailVerificationExpiresAt !== undefined
      ? {
          emailVerificationExpiresAt: result.emailVerificationExpiresAt,
        }
      : {}),
  });
}

//************************************************************** */
