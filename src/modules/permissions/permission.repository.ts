import { prisma } from "../../config/prisma.js";
import type {
  Permission,
} from "./permission.constants.js";

//************************************************************** */

export async function findMembershipPermissions(
  organizationId: string,
  membershipId: string,
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
}

//************************************************************** */

export async function replaceMembershipPermissions(
  organizationId: string,
  membershipId: string,
  permissions: Permission[],
  grantedByMembershipId: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.membershipPermission.deleteMany({
        where: {
          organizationId,
          membershipId,
        },
      });

      if (permissions.length === 0) {
        return [];
      }

      await transaction.membershipPermission.createMany({
        data: permissions.map(
          (permission) => ({
            organizationId,
            membershipId,
            permission,
            grantedByMembershipId,
          }),
        ),
      });

      return transaction.membershipPermission.findMany({
        where: {
          organizationId,
          membershipId,
        },
        orderBy: {
          permission: "asc",
        },
      });
    },
  );
}

//************************************************************** */