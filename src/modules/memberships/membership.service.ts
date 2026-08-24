import { AppError } from "../../platform/errors/app-error.js";

import {
  MembershipStatus,
  type MembershipRole,
} from "../../generated/prisma/client.js";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../audit/audit.constants.js";

import { createAuditLog } from "../audit/audit.service.js";

import {
  assertMembershipCreateAllowed,
  assertMembershipRemovalAllowed,
  assertMembershipUpdateAllowed,
} from "./membership.policy.js";

import {
  countMembershipsByOrganization,
  createMembershipWithPermissions,
  findMembershipById,
  findMembershipByUserAndOrganization,
  findMembershipForUpdate,
  findMembershipsByOrganization,
  findUserForMembershipByEmail,
  removeMembershipRecord,
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

export async function createMembership(
  organizationId: string,
  actor: MembershipActorContext,
  email: string,
  role: MembershipRole,
): Promise<MembershipRecord> {
  assertMembershipCreateAllowed(actor, organizationId, role);

  const user = await findUserForMembershipByEmail(email);

  if (!user) {
    throw new AppError(404, "User not found.", {
      code: "USER_NOT_FOUND",
    });
  }

  const existingMembership = await findMembershipByUserAndOrganization(
    user.id,
    organizationId,
  );

  if (existingMembership) {
    throw new AppError(409, "User is already a member of this organization.", {
      code: "MEMBERSHIP_ALREADY_EXISTS",
    });
  }

  const permissions = getPermissionsForRole(role);

  const membership = await createMembershipWithPermissions(
    organizationId,
    user.id,
    role,
    permissions,
    actor.membershipId,
  );

  const record = toMembershipRecord(membership);

  await createAuditLog({
    action: AUDIT_ACTIONS.MEMBERSHIP_CREATED,

    entityType: AUDIT_ENTITY_TYPES.MEMBERSHIP,

    entityId: membership.id,

    actor: {
      organizationId,
    },

    after: record,

    metadata: {
      actorMembershipId: actor.membershipId,
    },
  });

  return record;
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

  let membership;

  if (roleChanged && data.role !== undefined) {
    const permissions = getPermissionsForRole(data.role);

    membership = await updateMembershipRoleAndPermissions(
      organizationId,
      membershipId,
      updateData,
      permissions,
      actor.membershipId,
    );
  } else {
    membership = await updateMembershipRecord(membershipId, updateData);
  }

  const record = toMembershipRecord(membership);

  const auditAction =
    statusChanged && data.status === MembershipStatus.SUSPENDED
      ? AUDIT_ACTIONS.MEMBERSHIP_SUSPENDED
      : AUDIT_ACTIONS.MEMBERSHIP_UPDATED;

  await createAuditLog({
    action: auditAction,

    entityType: AUDIT_ENTITY_TYPES.MEMBERSHIP,

    entityId: membership.id,

    actor: {
      organizationId,
    },

    before: existing,

    after: record,

    metadata: {
      actorMembershipId: actor.membershipId,

      roleChanged,
      statusChanged,
    },
  });

  return record;
}

//************************************************************** */

export async function removeMembership(
  organizationId: string,
  membershipId: string,
  actor: MembershipActorContext,
): Promise<MembershipRecord> {
  const existing = await findMembershipForUpdate(organizationId, membershipId);

  if (!existing) {
    throw new AppError(404, "Membership not found.", {
      code: "MEMBERSHIP_NOT_FOUND",
    });
  }

  assertMembershipRemovalAllowed(actor, existing, organizationId);

  if (existing.status === MembershipStatus.REMOVED) {
    throw new AppError(409, "Membership has already been removed.", {
      code: "MEMBERSHIP_ALREADY_REMOVED",
    });
  }

  const membership = await removeMembershipRecord(organizationId, membershipId);

  const record = toMembershipRecord(membership);

  await createAuditLog({
    action: AUDIT_ACTIONS.MEMBERSHIP_REMOVED,

    entityType: AUDIT_ENTITY_TYPES.MEMBERSHIP,

    entityId: membership.id,

    actor: {
      organizationId,
    },

    before: existing,

    after: record,

    metadata: {
      actorMembershipId: actor.membershipId,
    },
  });

  return record;
}

//************************************************************** */
