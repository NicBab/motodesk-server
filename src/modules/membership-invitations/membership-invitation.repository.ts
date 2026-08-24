import {
  MembershipStatus,
  type MembershipRole,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import type { Permission } from "../permissions/permission.constants.js";

//************************************************************** */

export async function findPendingMembershipInvitationByEmail(
  organizationId: string,
  email: string,
) {
  return prisma.membershipInvitation.findFirst({
    where: {
      organizationId,
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });
}

//************************************************************** */

export async function findMembershipInvitationById(
  organizationId: string,
  invitationId: string,
) {
  return prisma.membershipInvitation.findFirst({
    where: {
      id: invitationId,
      organizationId,
    },
  });
}

//************************************************************** */

export async function findMembershipInvitationByTokenHash(tokenHash: string) {
  return prisma.membershipInvitation.findUnique({
    where: {
      tokenHash,
    },

    include: {
      organization: true,
      invitedBy: true,
    },
  });
}

//************************************************************** */

export async function createMembershipInvitationRecord(
  organizationId: string,
  invitedByMembershipId: string,
  email: string,
  role: MembershipRole,
  tokenHash: string,
  expiresAt: Date,
) {
  return prisma.membershipInvitation.create({
    data: {
      organizationId,
      invitedByMembershipId,
      email,
      role,
      tokenHash,
      expiresAt,
    },

    include: {
      organization: true,
      invitedBy: true,
    },
  });
}

//************************************************************** */

export async function revokeMembershipInvitationRecord(invitationId: string) {
  return prisma.membershipInvitation.update({
    where: {
      id: invitationId,
    },

    data: {
      revokedAt: new Date(),
    },
  });
}

//************************************************************** */

export async function acceptMembershipInvitationRecord(
  invitationId: string,
  organizationId: string,
  userId: string,
  role: MembershipRole,
  permissions: Permission[],
  grantedByMembershipId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const membership = await transaction.membership.create({
      data: {
        organizationId,
        userId,
        role,
        status: MembershipStatus.ACTIVE,
      },

      include: {
        user: true,
        organization: true,
      },
    });

    if (permissions.length > 0) {
      await transaction.membershipPermission.createMany({
        data: permissions.map((permission) => ({
          organizationId,
          membershipId: membership.id,
          permission,
          grantedByMembershipId,
        })),
      });
    }

    await transaction.membershipInvitation.update({
      where: {
        id: invitationId,
      },

      data: {
        acceptedAt: new Date(),
      },
    });

    return membership;
  });
}

//************************************************************** */
