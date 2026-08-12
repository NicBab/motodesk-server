import type { Response } from "express";

import { AppError } from "../../../../platform/errors/app-error.js";

import { ok } from "../../../../platform/http/api-response.js";

import type { AuthenticatedRequest } from "../../auth.middleware.js";

import { logoutAllUserSessions } from "./service.js";

import { clearAuthenticationCookies } from "../../http/cookie.service.js";

//************************************************************** */

export async function logoutAll(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  if (!userId) {
    throw new AppError(401, "Authentication required.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const revokedSessionCount = await logoutAllUserSessions(userId);

  clearAuthenticationCookies(response);

  ok(response, {
    revokedSessionCount,
  });
}

//************************************************************** */
