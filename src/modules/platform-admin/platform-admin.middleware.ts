import type {
  NextFunction,
  Response,
} from "express";

import {
  PlatformAdminRole,
} from "../../generated/prisma/client.js";

import {
  prisma,
} from "../../config/prisma.js";

import {
  AppError,
} from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/auth.middleware.js";

//************************************************************** */

export interface AuthenticatedPlatformAdmin {
  id: string;
  userId: string;
  role: PlatformAdminRole;
}

//************************************************************** */

export interface PlatformAdminRequest extends AuthenticatedRequest {
  authenticatedPlatformAdmin?: AuthenticatedPlatformAdmin;
}

//************************************************************** */

// Run after authenticateRequest.
// Organization roles and permissions do not grant platform access.
export function requirePlatformAdmin(
  ...allowedRoles: PlatformAdminRole[]
) {
  return async (
    request: PlatformAdminRequest,
    _response: Response,
    next: NextFunction,
  ): Promise<void> => {
    delete request.authenticatedPlatformAdmin

    const user = request.authenticatedUser;

    if (!user) {
      throw new AppError(
        401,
        "Authentication is required.",
        {
          code: "AUTHENTICATION_REQUIRED",
        },
      );
    }

    // Read the grant and account state on every request.
    // Do not rely on a role cached in a JWT or client state.
    const platformAdmin = await prisma.platformAdmin.findUnique({
      where: {
        userId: user.id,
      },

      select: {
        id: true,
        userId: true,
        role: true,
        isActive: true,

        user: {
          select: {
            isActive: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (
      !platformAdmin ||
      !platformAdmin.isActive ||
      !platformAdmin.user.isActive
    ) {
      throw new AppError(
        403,
        "Platform administrator access is required.",
        {
          code: "PLATFORM_ADMIN_ACCESS_REQUIRED",
        },
      );
    }

    if (!platformAdmin.user.emailVerifiedAt) {
      throw new AppError(
        403,
        "Email verification is required for platform access.",
        {
          code: "PLATFORM_ADMIN_EMAIL_VERIFICATION_REQUIRED",
        },
      );
    }

    if (
      allowedRoles.length > 0 &&
      !allowedRoles.includes(platformAdmin.role)
    ) {
      throw new AppError(
        403,
        "Your platform role cannot perform this action.",
        {
          code: "PLATFORM_ADMIN_ROLE_REQUIRED",
        },
      );
    }

    request.authenticatedPlatformAdmin = {
      id: platformAdmin.id,
      userId: platformAdmin.userId,
      role: platformAdmin.role,
    };

    next();
  };
}

//************************************************************** */