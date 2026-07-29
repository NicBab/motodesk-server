import type {
  NextFunction,
  Response,
} from "express";

import { AppError } from "../../common/errors/app-error.js";
import type { AuthenticatedRequest } from "../auth/auth.middleware.js";

//************************************************************** */
export function requireOrganizationAccess(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): void {
  const organizationId =
    request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(
      400,
      "A valid organization ID is required.",
      {
        code: "ORGANIZATION_ID_REQUIRED",
      },
    );
  }

  const membership =
    request.authenticatedMembership;

  if (!membership) {
    throw new AppError(
      403,
      "Organization membership is required.",
      {
        code: "ORGANIZATION_MEMBERSHIP_REQUIRED",
      },
    );
  }

  if (
    membership.organizationId !==
    organizationId
  ) {
    throw new AppError(
      403,
      "You do not have access to this organization.",
      {
        code: "ORGANIZATION_ACCESS_DENIED",
      },
    );
  }

  next();
}

//************************************************************** */