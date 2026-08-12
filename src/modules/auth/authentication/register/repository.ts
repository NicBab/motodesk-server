import {
  MembershipStatus,
  MembershipRole,
  AuthTokenType,
  type Prisma,
} from "../../../../generated/prisma/client.js";

import {
  runTransaction,
} from "../../../../platform/database/repository.js";


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

export interface CreateUserRecordData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

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

  emailVerificationToken: {
    tokenHash: string;
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

        const emailVerificationToken =
  await transaction.authToken.create({
    data: {
      userId: user.id,
      type:
        AuthTokenType.EMAIL_VERIFICATION,
      tokenHash:
        data.emailVerificationToken.tokenHash,
      expiresAt:
        data.emailVerificationToken.expiresAt,
    },
  });

      return {
  user,
  membership,
  session,
  emailVerificationToken,
};
    },
  );
}

//************************************************************** */