import {
  MembershipStatus,
  type Prisma,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

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
  passwordHash: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

//************************************************************** */

export const authenticatedRequestUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
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

export interface CreateUserRecordData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

//************************************************************** */

export async function createUserRecord(
  data: CreateUserRecordData,
) {
  return prisma.user.create({
    data: {
      email: data.email,
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      isActive: true,
    },
    select: authenticationUserSelect,
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

export async function findAuthenticatedUserById(
  userId: string,
) {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select:
      authenticatedRequestUserSelect,
  });
}

//************************************************************** */

export async function findAuthenticatedMembership(
  membershipId: string,
  userId: string,
  organizationId: string | null,
) {
  return prisma.membership.findFirst({
    where: {
      id: membershipId,
      userId,

      ...(organizationId !== null
        ? {
            organizationId,
          }
        : {}),
    },
    select: {
      id: true,
      organizationId: true,
      role: true,
      status: true,
      organization: {
        select: {
          name: true,
        },
      },
    },
  });
}