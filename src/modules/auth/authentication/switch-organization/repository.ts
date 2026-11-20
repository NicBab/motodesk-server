
import {
  authenticationMembershipSelect,
  authenticationUserSelect,
} from "../../shared/repositories/user-auth.repository.js";

import {
  MembershipStatus,
  SessionAudience,
} from "../../../../generated/prisma/client.js";

import { prisma } from "../../../../config/prisma.js";

//************************************************************** */

export async function findUserForOrganizationSwitch(
  userId: string,
  organizationId: string,
) {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      ...authenticationUserSelect,
      memberships: {
        where: {
          organizationId,
          status: MembershipStatus.ACTIVE,
        },
        take: 1,
        select: authenticationMembershipSelect,
      },
    },
  });
}

//************************************************************** */

export async function updateSessionActiveOrganization(
  sessionId: string,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,

      userId,

      audience: SessionAudience.CLIENT,

      revokedAt: null,

      expiresAt: {
        gt: new Date(),
      },

      user: {
        isActive: true,

        memberships: {
          some: {
            organizationId,

            status: MembershipStatus.ACTIVE,
          },
        },
      },
    },

    data: {
      activeOrganizationId: organizationId,
    },
  });

  return result.count === 1;
}

//************************************************************** */
