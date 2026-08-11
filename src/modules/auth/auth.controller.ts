import type { Response } from "express";
import type { AuthenticatedRequest } from "./auth.middleware.js";
import { getPermissionsForRole } from "../permissions/permission.utils.js";
import { ok } from "../../platform/http/api-response.js";
import { AppError } from "../../platform/errors/app-error.js";

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
