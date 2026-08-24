import { MembershipRole } from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../audit/audit.constants.js";

import { createAuditLog } from "../audit/audit.service.js";

import type { AuthenticatedUser } from "../auth/auth.types.js";

import { generateRandomToken, hashToken } from "../auth/tokens/token.crypto.js";

import {
  findMembershipByUserAndOrganization,
  findUserForMembershipByEmail,
} from "../memberships/membership.repository.js";

import type { MembershipActorContext } from "../memberships/membership.types.js";

import { getPermissionsForRole } from "../permissions/permission.utils.js";

import {
  acceptMembershipInvitationRecord,
  createMembershipInvitationRecord,
  findMembershipInvitationById,
  findMembershipInvitationByTokenHash,
  findPendingMembershipInvitationByEmail,
  revokeMembershipInvitationRecord,
  countMembershipInvitationsByOrganization,
  findMembershipInvitationsByOrganization,
  refreshMembershipInvitationRecord,
} from "./membership-invitation.repository.js";

import {
  createPaginatedData,
  type PaginatedData,
  type PaginationInput,
} from "../../platform/http/pagination.js";

//************************************************************** */

const MEMBERSHIP_INVITATION_TTL_DAYS = 7;

const MEMBERSHIP_INVITATION_TTL_MILLISECONDS =
  MEMBERSHIP_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1_000;

//************************************************************** */

export interface CreateMembershipInvitationResult {
  invitation: {
    id: string;
    organizationId: string;
    invitedByMembershipId: string;
    email: string;
    role: MembershipRole;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
  };

  token: string;
}

//************************************************************** */

export async function listMembershipInvitations(
  organizationId: string,
  pagination: PaginationInput,
): Promise<
  PaginatedData<{
    id: string;
    organizationId: string;
    invitedByMembershipId: string;
    email: string;
    role: MembershipRole;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  const [invitations, totalItems] = await Promise.all([
    findMembershipInvitationsByOrganization(organizationId, pagination),

    countMembershipInvitationsByOrganization(organizationId),
  ]);

  return createPaginatedData(invitations, pagination, totalItems);
}

//************************************************************** */

export async function createMembershipInvitation(
  organizationId: string,
  actor: MembershipActorContext,
  email: string,
  role: MembershipRole,
): Promise<CreateMembershipInvitationResult> {
  if (actor.organizationId !== organizationId) {
    throw new AppError(
      403,
      "You cannot create invitations for another organization.",
      {
        code: "CROSS_ORGANIZATION_ACCESS_FORBIDDEN",
      },
    );
  }

  if (role === MembershipRole.OWNER) {
    throw new AppError(
      403,
      "The owner role cannot be assigned through an invitation.",
      {
        code: "OWNER_ASSIGNMENT_FORBIDDEN",
      },
    );
  }

  if (actor.role === MembershipRole.ADMIN && role === MembershipRole.ADMIN) {
    throw new AppError(
      403,
      "Administrators cannot invite another administrator.",
      {
        code: "ADMIN_ROLE_ASSIGNMENT_FORBIDDEN",
      },
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await findUserForMembershipByEmail(normalizedEmail);

  if (existingUser) {
    const existingMembership = await findMembershipByUserAndOrganization(
      existingUser.id,
      organizationId,
    );

    if (existingMembership) {
      throw new AppError(
        409,
        "User is already a member of this organization.",
        {
          code: "MEMBERSHIP_ALREADY_EXISTS",
        },
      );
    }
  }

  const existingInvitation = await findPendingMembershipInvitationByEmail(
    organizationId,
    normalizedEmail,
  );

  if (existingInvitation) {
    throw new AppError(
      409,
      "A pending invitation already exists for this email address.",
      {
        code: "MEMBERSHIP_INVITATION_ALREADY_EXISTS",
      },
    );
  }

  const token = generateRandomToken();

  const tokenHash = hashToken(token);

  const expiresAt = new Date(
    Date.now() + MEMBERSHIP_INVITATION_TTL_MILLISECONDS,
  );

  const invitation = await createMembershipInvitationRecord(
    organizationId,
    actor.membershipId,
    normalizedEmail,
    role,
    tokenHash,
    expiresAt,
  );

  await createAuditLog({
    action: AUDIT_ACTIONS.INVITATION_CREATED,

    entityType: AUDIT_ENTITY_TYPES.INVITATION,

    entityId: invitation.id,

    actor: {
      organizationId,
    },

    after: {
      id: invitation.id,

      organizationId: invitation.organizationId,

      invitedByMembershipId: invitation.invitedByMembershipId,

      email: invitation.email,

      role: invitation.role,

      expiresAt: invitation.expiresAt,

      acceptedAt: invitation.acceptedAt,

      revokedAt: invitation.revokedAt,
    },

    metadata: {
      actorMembershipId: actor.membershipId,
    },
  });

  return {
    invitation: {
      id: invitation.id,

      organizationId: invitation.organizationId,

      invitedByMembershipId: invitation.invitedByMembershipId,

      email: invitation.email,

      role: invitation.role,

      expiresAt: invitation.expiresAt,

      createdAt: invitation.createdAt,

      updatedAt: invitation.updatedAt,
    },

    token,
  };
}

//************************************************************** */

export async function revokeMembershipInvitation(
  organizationId: string,
  invitationId: string,
  actor: MembershipActorContext,
) {
  if (actor.organizationId !== organizationId) {
    throw new AppError(
      403,
      "You cannot revoke invitations for another organization.",
      {
        code: "CROSS_ORGANIZATION_ACCESS_FORBIDDEN",
      },
    );
  }

  const invitation = await findMembershipInvitationById(
    organizationId,
    invitationId,
  );

  if (!invitation) {
    throw new AppError(404, "Membership invitation not found.", {
      code: "MEMBERSHIP_INVITATION_NOT_FOUND",
    });
  }

  if (invitation.acceptedAt) {
    throw new AppError(409, "Accepted invitations cannot be revoked.", {
      code: "MEMBERSHIP_INVITATION_ALREADY_ACCEPTED",
    });
  }

  if (invitation.revokedAt) {
    throw new AppError(409, "Membership invitation has already been revoked.", {
      code: "MEMBERSHIP_INVITATION_ALREADY_REVOKED",
    });
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new AppError(410, "Membership invitation has expired.", {
      code: "MEMBERSHIP_INVITATION_EXPIRED",
    });
  }

  const revokedInvitation =
    await revokeMembershipInvitationRecord(invitationId);

  await createAuditLog({
    action: AUDIT_ACTIONS.INVITATION_REVOKED,

    entityType: AUDIT_ENTITY_TYPES.INVITATION,

    entityId: invitationId,

    actor: {
      organizationId,
    },

    before: invitation,

    after: revokedInvitation,

    metadata: {
      actorMembershipId: actor.membershipId,
    },
  });

  return revokedInvitation;
}

//************************************************************** */

export async function refreshMembershipInvitation(
  organizationId: string,
  invitationId: string,
  actor: MembershipActorContext,
): Promise<CreateMembershipInvitationResult> {
  if (actor.organizationId !== organizationId) {
    throw new AppError(
      403,
      "You cannot refresh invitations for another organization.",
      {
        code: "CROSS_ORGANIZATION_ACCESS_FORBIDDEN",
      },
    );
  }

  const invitation = await findMembershipInvitationById(
    organizationId,
    invitationId,
  );

  if (!invitation) {
    throw new AppError(404, "Membership invitation not found.", {
      code: "MEMBERSHIP_INVITATION_NOT_FOUND",
    });
  }

  if (invitation.acceptedAt) {
    throw new AppError(409, "Accepted invitations cannot be refreshed.", {
      code: "MEMBERSHIP_INVITATION_ALREADY_ACCEPTED",
    });
  }

  const token = generateRandomToken();

  const tokenHash = hashToken(token);

  const expiresAt = new Date(
    Date.now() + MEMBERSHIP_INVITATION_TTL_MILLISECONDS,
  );

  const refreshedInvitation = await refreshMembershipInvitationRecord(
    invitationId,
    tokenHash,
    expiresAt,
  );

  await createAuditLog({
    action: AUDIT_ACTIONS.INVITATION_CREATED,

    entityType: AUDIT_ENTITY_TYPES.INVITATION,

    entityId: invitationId,

    actor: {
      organizationId,
    },

    before: invitation,

    after: refreshedInvitation,

    metadata: {
      actorMembershipId: actor.membershipId,

      refreshed: true,
    },
  });

  return {
    invitation: {
      id: refreshedInvitation.id,

      organizationId: refreshedInvitation.organizationId,

      invitedByMembershipId: refreshedInvitation.invitedByMembershipId,

      email: refreshedInvitation.email,

      role: refreshedInvitation.role,

      expiresAt: refreshedInvitation.expiresAt,

      createdAt: refreshedInvitation.createdAt,

      updatedAt: refreshedInvitation.updatedAt,
    },

    token,
  };
}

//************************************************************** */

//************************************************************** */

export async function acceptMembershipInvitation(
  token: string,
  user: AuthenticatedUser,
) {
  const tokenHash = hashToken(token);

  const invitation = await findMembershipInvitationByTokenHash(tokenHash);

  if (!invitation) {
    throw new AppError(404, "Membership invitation not found.", {
      code: "MEMBERSHIP_INVITATION_NOT_FOUND",
    });
  }

  if (invitation.acceptedAt) {
    throw new AppError(
      409,
      "Membership invitation has already been accepted.",
      {
        code: "MEMBERSHIP_INVITATION_ALREADY_ACCEPTED",
      },
    );
  }

  if (invitation.revokedAt) {
    throw new AppError(410, "Membership invitation has been revoked.", {
      code: "MEMBERSHIP_INVITATION_REVOKED",
    });
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new AppError(410, "Membership invitation has expired.", {
      code: "MEMBERSHIP_INVITATION_EXPIRED",
    });
  }

  const authenticatedEmail = user.email.trim().toLowerCase();

  const invitationEmail = invitation.email.trim().toLowerCase();

  if (authenticatedEmail !== invitationEmail) {
    throw new AppError(
      403,
      "This invitation belongs to another email address.",
      {
        code: "MEMBERSHIP_INVITATION_EMAIL_MISMATCH",
      },
    );
  }

  const existingMembership = await findMembershipByUserAndOrganization(
    user.id,
    invitation.organizationId,
  );

  if (existingMembership) {
    throw new AppError(409, "User is already a member of this organization.", {
      code: "MEMBERSHIP_ALREADY_EXISTS",
    });
  }

  const permissions = getPermissionsForRole(invitation.role);

  const membership = await acceptMembershipInvitationRecord(
    invitation.id,
    invitation.organizationId,
    user.id,
    invitation.role,
    permissions,
    invitation.invitedByMembershipId,
  );

  await createAuditLog({
    action: AUDIT_ACTIONS.INVITATION_ACCEPTED,

    entityType: AUDIT_ENTITY_TYPES.INVITATION,

    entityId: invitation.id,

    actor: {
      userId: user.id,

      organizationId: invitation.organizationId,
    },

    before: invitation,

    after: {
      acceptedAt: new Date(),

      membershipId: membership.id,

      membershipRole: membership.role,
    },

    metadata: {
      invitedByMembershipId: invitation.invitedByMembershipId,
    },
  });

  return membership;
}

//************************************************************** */
