import { AppError } from "../../platform/errors/app-error.js";

import { assertMembershipUpdateAllowed } from "./membership.policy.js";

import {
  countMembershipsByOrganization,
  findMembershipById,
  findMembershipForUpdate,
  findMembershipsByOrganization,
  updateMembershipRecord,
  updateMembershipRoleAndPermissions,
} from "./membership.repository.js";

import type {
  MembershipActorContext,
  MembershipListItem,
  MembershipRecord,
  MembershipUpdateData,
} from "./membership.types.js";

import {
  toMembershipListItem,
  toMembershipRecord,
} from "./membership.utils.js";

import {
  createPaginatedData,
  type PaginatedData,
  type PaginationInput,
} from "../../platform/http/pagination.js";

import { getPermissionsForRole } from "../permissions/permission.utils.js";

//************************************************************** */

export async function listMemberships(
  organizationId: string,
  pagination: PaginationInput,
): Promise<PaginatedData<MembershipListItem>> {
  const [memberships, totalItems] = await Promise.all([
    findMembershipsByOrganization(organizationId, pagination),

    countMembershipsByOrganization(organizationId),
  ]);

  const items = memberships.map(toMembershipListItem);

  return createPaginatedData(items, pagination, totalItems);
}

//************************************************************** */

export async function getMembershipById(
  organizationId: string,
  membershipId: string,
): Promise<MembershipRecord> {
  const membership = await findMembershipById(organizationId, membershipId);

  if (!membership) {
    throw new AppError(404, "Membership not found.", {
      code: "MEMBERSHIP_NOT_FOUND",
    });
  }

  return toMembershipRecord(membership);
}

//************************************************************** */

export async function updateMembership(
  organizationId: string,
  membershipId: string,
  actor: MembershipActorContext,
  data: MembershipUpdateData,
): Promise<MembershipRecord> {
  const existing = await findMembershipForUpdate(organizationId, membershipId);

  if (!existing) {
    throw new AppError(404, "Membership not found.", {
      code: "MEMBERSHIP_NOT_FOUND",
    });
  }

  const { roleChanged, statusChanged } = assertMembershipUpdateAllowed(
    actor,
    existing,
    organizationId,
    data,
  );

  const updateData: MembershipUpdateData = {
    ...(roleChanged && data.role !== undefined
      ? {
          role: data.role,
        }
      : {}),

    ...(statusChanged && data.status !== undefined
      ? {
          status: data.status,
        }
      : {}),
  };

  if (roleChanged && data.role !== undefined) {
    const permissions = getPermissionsForRole(data.role);

    const membership = await updateMembershipRoleAndPermissions(
      organizationId,
      membershipId,
      updateData,
      permissions,
      actor.membershipId,
    );

    return toMembershipRecord(membership);
  }

  const membership = await updateMembershipRecord(membershipId, updateData);

  return toMembershipRecord(membership);
}

//************************************************************** */
