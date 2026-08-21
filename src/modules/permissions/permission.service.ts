import { AppError } from "../../platform/errors/app-error.js";

import {
  MembershipRole,
} from "../../generated/prisma/client.js";

import {
  findMembershipForUpdate,
} from "../memberships/membership.repository.js";

import type {
  MembershipActorContext,
} from "../memberships/membership.types.js";

import {
  findMembershipPermissions,
  replaceMembershipPermissions,
} from "./permission.repository.js";

import type {
  Permission,
} from "./permission.constants.js";

//************************************************************** */

export async function getMembershipPermissions(
  organizationId: string,
  membershipId: string,
): Promise<Permission[]> {
  const membership =
    await findMembershipForUpdate(
      organizationId,
      membershipId,
    );

  if (!membership) {
    throw new AppError(
      404,
      "Membership not found.",
      {
        code: "MEMBERSHIP_NOT_FOUND",
      },
    );
  }

  const permissions =
    await findMembershipPermissions(
      organizationId,
      membershipId,
    );

  return permissions.map(
    (permission) =>
      permission.permission as Permission,
  );
}

//************************************************************** */

export async function updateMembershipPermissions(
  organizationId: string,
  membershipId: string,
  actor: MembershipActorContext,
  permissions: Permission[],
): Promise<Permission[]> {
  if (
    actor.organizationId !==
    organizationId
  ) {
    throw new AppError(
      403,
      "You cannot manage permissions for another organization.",
      {
        code:
          "CROSS_ORGANIZATION_ACCESS_FORBIDDEN",
      },
    );
  }

  if (
    actor.role !==
    MembershipRole.OWNER
  ) {
    throw new AppError(
      403,
      "Only the organization owner can manage membership permissions.",
      {
        code:
          "PERMISSION_MANAGEMENT_FORBIDDEN",
      },
    );
  }

  const membership =
    await findMembershipForUpdate(
      organizationId,
      membershipId,
    );

  if (!membership) {
    throw new AppError(
      404,
      "Membership not found.",
      {
        code: "MEMBERSHIP_NOT_FOUND",
      },
    );
  }

  if (
    membership.organizationId !==
    organizationId
  ) {
    throw new AppError(
      403,
      "The membership does not belong to this organization.",
      {
        code:
          "MEMBERSHIP_ORGANIZATION_MISMATCH",
      },
    );
  }

  if (
    membership.role ===
    MembershipRole.OWNER
  ) {
    throw new AppError(
      403,
      "Owners cannot be modified.",
      {
        code: "OWNER_PROTECTED",
      },
    );
  }

  const updatedPermissions =
    await replaceMembershipPermissions(
      organizationId,
      membershipId,
      permissions,
      actor.membershipId,
    );

  return updatedPermissions.map(
    (permission) =>
      permission.permission as Permission,
  );
}

//************************************************************** */