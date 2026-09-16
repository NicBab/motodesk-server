import type { Request, Response } from "express";

import { ok } from "../../../../platform/http/api-response.js";

import { AppError } from "../../../../platform/errors/app-error.js";

import { getRequestMetadata } from "../../../../platform/request/request.metadata.js";

import { REFRESH_TOKEN_COOKIE_NAME } from "../../auth.constants.js";

import { setAuthenticationCookies } from "../../http/cookie.service.js";

import { refreshSession } from "./service.js";

import { getPermissionsForRole } from "../../../permissions/permission.utils.js";

//************************************************************** */

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

//************************************************************** */

export async function refresh(
  request: Request,
  response: Response,
): Promise<void> {
  const requestWithCookies = request as RequestWithCookies;

  const refreshToken = requestWithCookies.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  if (!refreshToken) {
    throw new AppError(401, "Refresh session is unavailable.", {
      code: "REFRESH_TOKEN_REQUIRED",
    });
  }

  const result = await refreshSession(
    refreshToken,
    getRequestMetadata(request),
  );

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
