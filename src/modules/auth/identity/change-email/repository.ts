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
    },
    select: authenticationUserSelect,
  });
}
