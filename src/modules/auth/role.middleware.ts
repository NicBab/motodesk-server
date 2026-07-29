import type {
  NextFunction,
  Response,
} from "express";

import {
  MembershipRole,
} from "../../generated/prisma/client.js";

import type {
  AuthenticatedRequest,
} from "./auth.middleware.js";

//************************************************************** */

export function requireRoles(
  ...allowedRoles: MembershipRole[]
) {
  return (
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): void => {
    const membership =
      request.authenticatedMembership;

    if (!membership) {
      response.status(403).json({
        message:
          "Organization membership is required.",
      });

      return;
    }

    if (
      !allowedRoles.includes(
        membership.role,
      )
    ) {
      response.status(403).json({
        message:
          "You do not have permission to perform this action.",
      });

      return;
    }

    next();
  };
}

//************************************************************** */