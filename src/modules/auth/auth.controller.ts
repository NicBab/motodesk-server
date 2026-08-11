import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "./auth.middleware.js";
import { getPermissionsForRole } from "../permissions/permission.utils.js";
import { ok } from "../../platform/http/api-response.js";
import { AppError } from "../../platform/errors/app-error.js";
import { requireValidatedBody } from "../../platform/validation/validated-request.js";

import {
  clearAuthenticationCookies,
} from "./cookie.service.js";

import {
  logoutAllUserSessions,
  logoutUser,
} from "./auth.service.js";

import type { LogoutInput } from "./auth.schemas.js";

//************************************************************** */

export async function logout(
  request: Request,
  response: Response,
): Promise<void> {
  const input = requireValidatedBody<LogoutInput>(request);

  await logoutUser(input);

  clearAuthenticationCookies(response);

  ok(response, {
    message: "Logged out successfully.",
  });
}

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

export async function me(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const user = request.authenticatedUser;

  if (!user) {
    throw new AppError(401, "Authentication required.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const permissions = request.authenticatedMembership
    ? getPermissionsForRole(request.authenticatedMembership.role)
    : [];

  ok(response, {
    user,
    membership: request.authenticatedMembership,
    permissions,
  });
}

//************************************************************** */
