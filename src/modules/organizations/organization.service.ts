import { OrganizationStatus } from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../audit/audit.constants.js";

import { createAuditLog } from "../audit/audit.service.js";

import {
  archiveOrganizationRecord,
  createOrganizationWithOwner,
  findOrganizationById,
  findOrganizationBySlug,
  findOrganizationsForUser,
  updateOrganizationRecord,
} from "./organization.repository.js";

import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from "./organization.types.js";

import {
  MembershipRole,
  MembershipStatus,
} from "../../generated/prisma/client.js";

import { findMembershipForUpdate } from "../memberships/membership.repository.js";

import type { MembershipActorContext } from "../memberships/membership.types.js";

import { getPermissionsForRole } from "../permissions/permission.utils.js";

import { transferOrganizationOwnershipRecord } from "./organization.repository.js";

//************************************************************** */

export async function createOrganization(input: CreateOrganizationInput) {
  const existingOrganization = await findOrganizationBySlug(input.slug);

  if (existingOrganization) {
    throw new AppError(409, "An organization with this slug already exists.", {
      code: "ORGANIZATION_SLUG_TAKEN",
    });
  }

  const organization = await createOrganizationWithOwner(input);

  await createAuditLog({
    action: AUDIT_ACTIONS.ORGANIZATION_CREATED,

    entityType: AUDIT_ENTITY_TYPES.ORGANIZATION,

    entityId: organization.id,

    actor: {
      userId: input.ownerUserId,

      organizationId: organization.id,
    },

    after: organization,
  });

  return organization;
}

//************************************************************** */

export async function getOrganizationById(organizationId: string) {
  const organization = await findOrganizationById(organizationId);

  if (!organization) {
    throw new AppError(404, "Organization not found.", {
      code: "ORGANIZATION_NOT_FOUND",
    });
  }

  return organization;
}

//************************************************************** */

export async function getOrganizationsForUser(userId: string) {
  return findOrganizationsForUser(userId);
}

//************************************************************** */

export async function updateOrganization(
  organizationId: string,
  input: UpdateOrganizationInput,
  actorUserId: string,
) {
  const existingOrganization = await getOrganizationById(organizationId);

  if (existingOrganization.status === OrganizationStatus.ARCHIVED) {
    throw new AppError(409, "Archived organizations cannot be modified.", {
      code: "ORGANIZATION_ARCHIVED",
    });
  }

  const updatedOrganization = await updateOrganizationRecord(
    organizationId,
    input,
  );

  await createAuditLog({
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,

    entityType: AUDIT_ENTITY_TYPES.ORGANIZATION,

    entityId: organizationId,

    actor: {
      userId: actorUserId,

      organizationId,
    },

    before: existingOrganization,

    after: updatedOrganization,
  });

  return updatedOrganization;
}

//************************************************************** */

export async function archiveOrganization(
  organizationId: string,
  actorUserId: string,
) {
  const existingOrganization = await getOrganizationById(organizationId);

  if (existingOrganization.status === OrganizationStatus.ARCHIVED) {
    throw new AppError(409, "Organization has already been archived.", {
      code: "ORGANIZATION_ALREADY_ARCHIVED",
    });
  }

  const archivedOrganization = await archiveOrganizationRecord(organizationId);

  await createAuditLog({
    action: AUDIT_ACTIONS.ORGANIZATION_ARCHIVED,

    entityType: AUDIT_ENTITY_TYPES.ORGANIZATION,

    entityId: organizationId,

    actor: {
      userId: actorUserId,

      organizationId,
    },

    before: existingOrganization,

    after: archivedOrganization,
  });

  return archivedOrganization;
}

//************************************************************** */

export async function transferOrganizationOwnership(
  organizationId: string,
  newOwnerMembershipId: string,
  actor: MembershipActorContext,
  actorUserId: string,
) {
  if (actor.organizationId !== organizationId) {
    throw new AppError(
      403,
      "You cannot transfer ownership for another organization.",
      {
        code: "CROSS_ORGANIZATION_ACCESS_FORBIDDEN",
      },
    );
  }

  if (actor.role !== MembershipRole.OWNER) {
    throw new AppError(
      403,
      "Only the current organization owner can transfer ownership.",
      {
        code: "ORGANIZATION_OWNERSHIP_TRANSFER_FORBIDDEN",
      },
    );
  }

  if (actor.membershipId === newOwnerMembershipId) {
    throw new AppError(
      400,
      "The selected membership is already the organization owner.",
      {
        code: "ORGANIZATION_OWNER_ALREADY_SELECTED",
      },
    );
  }

  const organization = await getOrganizationById(organizationId);

  if (organization.status === OrganizationStatus.ARCHIVED) {
    throw new AppError(
      409,
      "Ownership cannot be transferred for an archived organization.",
      {
        code: "ORGANIZATION_ARCHIVED",
      },
    );
  }

  const targetMembership = await findMembershipForUpdate(
    organizationId,
    newOwnerMembershipId,
  );

  if (!targetMembership) {
    throw new AppError(404, "Target membership not found.", {
      code: "MEMBERSHIP_NOT_FOUND",
    });
  }

  if (targetMembership.status !== MembershipStatus.ACTIVE) {
    throw new AppError(
      409,
      "Ownership can only be transferred to an active membership.",
      {
        code: "TARGET_MEMBERSHIP_NOT_ACTIVE",
      },
    );
  }

  if (targetMembership.role === MembershipRole.OWNER) {
    throw new AppError(409, "The selected membership is already an owner.", {
      code: "TARGET_MEMBERSHIP_ALREADY_OWNER",
    });
  }

  const newOwnerPermissions = getPermissionsForRole(MembershipRole.OWNER);

  const previousOwnerPermissions = getPermissionsForRole(MembershipRole.ADMIN);

  const result = await transferOrganizationOwnershipRecord(
    organizationId,
    actor.membershipId,
    newOwnerMembershipId,
    newOwnerPermissions,
    previousOwnerPermissions,
  );

  await createAuditLog({
    action: AUDIT_ACTIONS.ORGANIZATION_OWNERSHIP_TRANSFERRED,

    entityType: AUDIT_ENTITY_TYPES.ORGANIZATION,

    entityId: organizationId,

    actor: {
      userId: actorUserId,

      organizationId,
    },

    before: {
      ownerMembershipId: actor.membershipId,
    },

    after: {
      ownerMembershipId: result.newOwnerMembership.id,

      previousOwnerMembershipId: result.previousOwnerMembership.id,
    },

    metadata: {
      previousOwnerRole: MembershipRole.OWNER,

      newPreviousOwnerRole: MembershipRole.ADMIN,

      newOwnerPreviousRole: targetMembership.role,

      newOwnerRole: MembershipRole.OWNER,
    },
  });

  return result;
}

//************************************************************** */
