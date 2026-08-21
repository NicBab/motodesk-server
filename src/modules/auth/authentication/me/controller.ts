import type { Response } from "express";

import { MembershipRole } from "../../../../generated/prisma/client.js";

import type { AuthenticatedRequest } from "../../auth.middleware.js";

import { findMembershipPermissions } from "../../../permissions/permission.repository.js";

import {
  getEffectivePermissions,
  getPermissionsForRole,
} from "../../../permissions/permission.utils.js";

import type { Permission } from "../../../permissions/permission.constants.js";

import { ok } from "../../../../platform/http/api-response.js";

import { AppError } from "../../../../platform/errors/app-error.js";

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

  const membership = request.authenticatedMembership;

  let permissions: Permission[] = [];

  if (membership) {
    if (membership.role === MembershipRole.OWNER) {
      permissions = getPermissionsForRole(MembershipRole.OWNER);
    } else {
      const storedPermissions = await findMembershipPermissions(
        membership.organizationId,
        membership.id,
      );

      const membershipPermissions = storedPermissions.map(
        (record) => record.permission as Permission,
      );

      permissions = getEffectivePermissions(
        membership.role,
        membershipPermissions,
      );
    }
  }

  ok(response, {
    user,
    membership,
    permissions,
  });
}

//************************************************************** */

// import type { Response } from "express";
// import type { AuthenticatedRequest } from "../../auth.middleware.js";
// import { getPermissionsForRole } from "../../../permissions/permission.utils.js";
// import { ok } from "../../../../platform/http/api-response.js";
// import { AppError } from "../../../../platform/errors/app-error.js";

// //************************************************************** */

// export async function me(
//   request: AuthenticatedRequest,
//   response: Response,
// ): Promise<void> {
//   const user = request.authenticatedUser;

//   if (!user) {
//     throw new AppError(401, "Authentication required.", {
//       code: "AUTHENTICATION_REQUIRED",
//     });
//   }

//   const permissions = request.authenticatedMembership
//     ? getPermissionsForRole(request.authenticatedMembership.role)
//     : [];

//   ok(response, {
//     user,
//     membership: request.authenticatedMembership,
//     permissions,
//   });
// }

// //************************************************************** */
