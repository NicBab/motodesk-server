import {
  authenticationMembershipSelect,
  authenticationUserSelect,
} from "../../shared/repositories/user-auth.repository.js";

import {
  MembershipStatus,
} from "../../../../generated/prisma/client.js";

import { prisma } from "../../../../config/prisma.js";


//************************************************************** */

export async function findUserForAuthentication(
  userId: string,
) {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      ...authenticationUserSelect,
      memberships: {
        where: {
          status: MembershipStatus.ACTIVE,
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 1,
        select: authenticationMembershipSelect,
      },
    },
  });
}

//************************************************************** */