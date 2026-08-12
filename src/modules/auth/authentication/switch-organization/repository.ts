import {
  authenticationMembershipSelect,
  authenticationUserSelect,
} from "../../shared/repositories/user-auth.repository.js";

import { MembershipStatus } from "../../../../generated/prisma/client.js";

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
