import {
  ExternalAuthProvider,
  MembershipStatus,
  type Prisma,
} from "../../../generated/prisma/client.js";

import { prisma } from "../../../config/prisma.js";

import { runTransaction } from "../../../platform/database/repository.js";

//************************************************************** */

export const oauthMembershipSelect = {
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

export const oauthUserSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  phone: true,
  jobTitle: true,
  preferredTimezone: true,
  displayMode: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

//************************************************************** */

export interface CreateExternalAuthAccountData {
  userId: string;

  provider: ExternalAuthProvider;

  providerAccountId: string;

  providerEmail: string | null;
}

//************************************************************** */

export interface CreateExternalUserData {
  email: string;

  firstName: string;

  lastName: string;

  provider: ExternalAuthProvider;

  providerAccountId: string;

  providerEmail: string | null;
}

//************************************************************** */

export async function findExternalAuthAccount(
  provider: ExternalAuthProvider,
  providerAccountId: string,
) {
  return prisma.externalAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId,
      },
    },

    include: {
      user: {
        select: {
          ...oauthUserSelect,

          memberships: {
            where: {
              status: MembershipStatus.ACTIVE,
            },

            orderBy: {
              createdAt: "asc",
            },

            take: 1,

            select: oauthMembershipSelect,
          },
        },
      },
    },
  });
}

//************************************************************** */

export async function findUserForExternalAuthentication(email: string) {
  return prisma.user.findUnique({
    where: {
      email,
    },

    select: {
      ...oauthUserSelect,

      memberships: {
        where: {
          status: MembershipStatus.ACTIVE,
        },

        orderBy: {
          createdAt: "asc",
        },

        take: 1,

        select: oauthMembershipSelect,
      },
    },
  });
}

//************************************************************** */

export async function createExternalAuthAccount(
  data: CreateExternalAuthAccountData,
) {
  return prisma.externalAuthAccount.create({
    data: {
      userId: data.userId,

      provider: data.provider,

      providerAccountId: data.providerAccountId,

      providerEmail: data.providerEmail,
    },
  });
}

//************************************************************** */

export async function updateExternalAuthAccountEmail(
  externalAuthAccountId: string,
  providerEmail: string | null,
) {
  return prisma.externalAuthAccount.update({
    where: {
      id: externalAuthAccountId,
    },

    data: {
      providerEmail,
    },
  });
}

//************************************************************** */

export async function findExternalAuthAccountForUser(
  userId: string,
  provider: ExternalAuthProvider,
) {
  return prisma.externalAuthAccount.findFirst({
    where: {
      userId,
      provider,
    },
  });
}

//************************************************************** */

export async function linkExternalAuthAccount(
  data: CreateExternalAuthAccountData,
) {
  return runTransaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: {
        id: data.userId,
      },

      select: {
        id: true,
        isActive: true,
      },
    });

    if (!user) {
      return null;
    }

    const externalAuthAccount = await transaction.externalAuthAccount.create({
      data: {
        userId: data.userId,

        provider: data.provider,

        providerAccountId: data.providerAccountId,

        providerEmail: data.providerEmail,
      },
    });

    return {
      user,
      externalAuthAccount,
    };
  });
}

//************************************************************** */

export async function createExternalUser(data: CreateExternalUserData) {
  return runTransaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        email: data.email,

        passwordHash: null,

        firstName: data.firstName,

        lastName: data.lastName,

        phone: null,

        isActive: true,

        emailVerifiedAt: new Date(),
      },

      select: {
        ...oauthUserSelect,

        memberships: {
          where: {
            status: MembershipStatus.ACTIVE,
          },

          orderBy: {
            createdAt: "asc",
          },

          take: 1,

          select: oauthMembershipSelect,
        },
      },
    });

    const externalAuthAccount = await transaction.externalAuthAccount.create({
      data: {
        userId: user.id,

        provider: data.provider,

        providerAccountId: data.providerAccountId,

        providerEmail: data.providerEmail,
      },
    });

    return {
      user,
      externalAuthAccount,
    };
  });
}

//************************************************************** */
