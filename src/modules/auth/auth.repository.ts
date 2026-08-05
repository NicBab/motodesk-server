import {
  MembershipStatus,
  MembershipRole,
  type Prisma,
} from "../../generated/prisma/client.js";

import {
  runTransaction,
} from "../../platform/database/repository.js";

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

//************************************************************** */
//************************************************************** */

export interface RegistrationOrganizationData {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
}

//************************************************************** */

export interface CreateRegistrationRecordsData {
  user: CreateUserRecordData;

  session: {
    id: string;
    tokenHash: string;
    userAgent: string | null;
    ipAddress: string | null;
    expiresAt: Date;
  };

  organization?: RegistrationOrganizationData;
}

//************************************************************** */

export async function createRegistrationRecords(
  data: CreateRegistrationRecordsData,
) {
  return runTransaction(
    async (transaction) => {
      const user =
        await transaction.user.create({
          data: {
            email: data.user.email,
            passwordHash:
              data.user.passwordHash,
            firstName:
              data.user.firstName,
            lastName:
              data.user.lastName,
            phone: data.user.phone,
            isActive: true,
          },
          select: authenticationUserSelect,
        });

      let membership = null;

      if (data.organization) {
        const organization =
          await transaction.organization.create({
            data: {
              name:
                data.organization.name,
              slug:
                data.organization.slug,

              ...(data.organization.email !==
              undefined
                ? {
                    email:
                      data.organization.email,
                  }
                : {}),

              ...(data.organization.phone !==
              undefined
                ? {
                    phone:
                      data.organization.phone,
                  }
                : {}),
            },
          });

        membership =
          await transaction.membership.create({
            data: {
              userId: user.id,
              organizationId:
                organization.id,
              role:
                MembershipRole.OWNER,
              status:
                MembershipStatus.ACTIVE,
            },
            select:
              authenticationMembershipSelect,
          });
      }

      const session =
        await transaction.session.create({
          data: {
            id: data.session.id,
            userId: user.id,
            tokenHash:
              data.session.tokenHash,
            userAgent:
              data.session.userAgent,
            ipAddress:
              data.session.ipAddress,
            expiresAt:
              data.session.expiresAt,
          },
        });

      return {
        user,
        membership,
        session,
      };
    },
  );
}

//************************************************************** */

export async function findUserPasswordById(
  userId: string,
) {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
    },
  });
}

//************************************************************** */

export async function updateUserPasswordHash(
  userId: string,
  passwordHash: string,
) {
  return prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      passwordHash,
    },
    select: {
      id: true,
      updatedAt: true,
    },
  });
}

//************************************************************** */


export async function findUserEmailById(
  userId: string,
) {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isActive: true,
    },
  });
}

//************************************************************** */

export async function updateUserEmailRecord(
  userId: string,
  email: string,
) {
  return prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      email,
    },
    select: authenticationUserSelect,
  });
}