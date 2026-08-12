import { type Prisma } from "../../../../generated/prisma/client.js";

import { prisma } from "../../../../config/prisma.js";

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

export async function findAuthenticatedUserById(userId: string) {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: authenticatedRequestUserSelect,
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
