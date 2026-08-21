import type {
  NextFunction,
  Response,
} from "express";

import {
  MembershipRole,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import type {
  Permission,
} from "./permission.constants.js";

import {
  findMembershipPermissions,
} from "./permission.repository.js";

import {
  checkEffectivePermissions,
  getEffectivePermissions,
  getPermissionsForRole,
} from "./permission.utils.js";

//************************************************************** */

export function requirePermissions(
  ...permissions: Permission[]
) {
  return async (
    request: AuthenticatedRequest,
    _response: Response,
    next: NextFunction,
  ): Promise<void> => {
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

    let effectivePermissions: Permission[];

    if (
      membership.role ===
      MembershipRole.OWNER
    ) {
      effectivePermissions =
        getPermissionsForRole(
          MembershipRole.OWNER,
        );
    } else {
      const storedPermissions =
        await findMembershipPermissions(
          membership.organizationId,
          membership.id,
        );

      const membershipPermissions =
        storedPermissions.map(
          (record) =>
            record.permission as Permission,
        );

      effectivePermissions =
        getEffectivePermissions(
          membership.role,
          membershipPermissions,
        );
    }

    const result =
      checkEffectivePermissions(
        effectivePermissions,
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

//************************************************************** */