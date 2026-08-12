import {
  MembershipStatus,
  type Prisma,
} from "../../../../generated/prisma/client.js";

import { prisma } from "../../../../config/prisma.js";

//************************************************************** */

export const authenticationMembershipSelect = {
  id: true,
  organizationId: true,
  role: true,
  status: true,
  organization: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.MembershipSelect;

//************************************************************** */

export const authenticationUserSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

//************************************************************** */

export async function findUserIdByEmail(
  email: string,
) {
  return prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
    },
  });
}

//************************************************************** */

export async function findUserForLogin(
  email: string,
) {
  return prisma.user.findUnique({
    where: {
      email,
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











