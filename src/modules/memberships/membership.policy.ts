//************************************************************** */
//************************************************************** */
// membership.policy.ts
//   enforces tenant rules
//   enforces role hierarchy
//   blocks self-modification
//   detects real changes
//************************************************************** */
//************************************************************** */

import { AppError } from "../../common/errors/app-error.js";
import {
  MembershipRole,
  type Membership,
} from "../../generated/prisma/client.js";
import type {
  MembershipActorContext,
  MembershipUpdateData,
} from "./membership.types.js";

//************************************************************** */

export interface MembershipUpdateChanges {
  roleChanged: boolean;
  statusChanged: boolean;
}

//************************************************************** */

export function assertMembershipUpdateAllowed(
  actor: MembershipActorContext,
  target: Membership,
  organizationId: string,
  data: MembershipUpdateData,
): MembershipUpdateChanges {
  if (actor.organizationId !== organizationId) {
    throw new AppError(
      403,
      "You cannot manage memberships for another organization.",
      {
        code: "CROSS_ORGANIZATION_ACCESS_FORBIDDEN",
      },
    );
  }

  if (target.organizationId !== organizationId) {
    throw new AppError(
      403,
      "The membership does not belong to this organization.",
      {
        code: "MEMBERSHIP_ORGANIZATION_MISMATCH",
      },
    );
  }

  if (target.role === MembershipRole.OWNER) {
    throw new AppError(403, "Owners cannot be modified.", {
      code: "OWNER_PROTECTED",
    });
  }

  if (data.role === MembershipRole.OWNER) {
    throw new AppError(
      403,
      "The owner role cannot be assigned through this endpoint.",
      {
        code: "OWNER_ASSIGNMENT_FORBIDDEN",
      },
    );
  }

  const isSelfUpdate = target.id === actor.membershipId;

  if (isSelfUpdate && data.role !== undefined) {
    throw new AppError(403, "You cannot change your own role.", {
      code: "SELF_ROLE_CHANGE_FORBIDDEN",
    });
  }

  if (
    isSelfUpdate &&
    data.status !== undefined &&
    data.status !== target.status
  ) {
    throw new AppError(403, "You cannot change your own membership status.", {
      code: "SELF_STATUS_CHANGE_FORBIDDEN",
    });
  }

  if (
    actor.role === MembershipRole.ADMIN &&
    target.role === MembershipRole.ADMIN
  ) {
    throw new AppError(
      403,
      "Administrators cannot modify other administrators.",
      {
        code: "ADMIN_PEER_MODIFICATION_FORBIDDEN",
      },
    );
  }

  if (
    actor.role === MembershipRole.ADMIN &&
    data.role === MembershipRole.ADMIN
  ) {
    throw new AppError(
      403,
      "Administrators cannot assign the administrator role.",
      {
        code: "ADMIN_ROLE_ASSIGNMENT_FORBIDDEN",
      },
    );
  }

  const roleChanged = data.role !== undefined && data.role !== target.role;

  const statusChanged =
    data.status !== undefined && data.status !== target.status;

  if (!roleChanged && !statusChanged) {
    throw new AppError(400, "No membership changes were provided.", {
      code: "NO_MEMBERSHIP_CHANGES",
    });
  }

  return {
    roleChanged,
    statusChanged,
  };
}

//************************************************************** */
