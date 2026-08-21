import { prisma } from "../../config/prisma.js";

export const membershipPermissionsRepository = {
  async findMembership(
    organizationId: string,
    membershipId: string
  ) {
    return prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId,
      },
      include: {
        permissions: true,
      },
    });
  },

  async findPermissions(
    organizationId: string,
    membershipId: string
  ) {
    return prisma.membershipPermission.findMany({
      where: {
        organizationId,
        membershipId,
      },
      orderBy: {
        permission: "asc",
      },
    });
  },

  async replacePermissions(
    organizationId: string,
    membershipId: string,
    permissions: string[],
    grantedByMembershipId: string
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.membershipPermission.deleteMany({
        where: {
          organizationId,
          membershipId,
        },
      });

      if (permissions.length === 0) {
        return [];
      }

      await tx.membershipPermission.createMany({
        data: permissions.map((permission) => ({
          organizationId,
          membershipId,
          permission,
          grantedByMembershipId,
        })),
      });

      return tx.membershipPermission.findMany({
        where: {
          organizationId,
          membershipId,
        },
        orderBy: {
          permission: "asc",
        },
      });
    });
  },
};