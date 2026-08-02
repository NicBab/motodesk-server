import type {
  NextFunction,
  Response,
} from "express";

import { AppError } from "../../platform/errors/app-error.js";
import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import type { Permission } from "./permission.constants.js";
import { checkPermissions } from "./permission.utils.js";

//************************************************************** */

export function requirePermissions(
  ...permissions: Permission[]
) {
  return (
    request: AuthenticatedRequest,
    _response: Response,
    next: NextFunction,
  ): void => {
    const membership =
      request.authenticatedMembership;

    if (!membership) {
      throw new AppError(
        401,
        "Authentication is required.",
        {
          code: "AUTHENTICATION_REQUIRED",
        },
      );
    }

    const result =
      checkPermissions(
        membership.role,
        permissions,
      );

    if (!result.allowed) {
      throw new AppError(
        403,
        "You do not have permission to perform this action.",
        {
          code: "INSUFFICIENT_PERMISSIONS",
          details: {
            missingPermissions:
              result.missingPermissions,
          },
        },
      );
    }

    next();
  };
}