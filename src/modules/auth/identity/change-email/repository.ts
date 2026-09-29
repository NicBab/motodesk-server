import { prisma } from "../../../../config/prisma.js";

import { authenticationUserSelect } from "../../shared/repositories/user-auth.repository.js";

//************************************************************** */

export async function findUserEmailById(userId: string) {
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

export async function updateUserEmailRecord(userId: string, email: string) {
  return prisma.user.update({
    where: {
      id: userId,
    },

    data: {
      email,

      //************************************************************** */
      // Verification belongs to the email address, not merely the
      // user account. A replacement address must prove ownership
      // independently before it is treated as verified.

      emailVerifiedAt: null,
    },

    select: authenticationUserSelect,
  });
}

//************************************************************** */
