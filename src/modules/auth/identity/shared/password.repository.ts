import { prisma } from "../../../../config/prisma.js";

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
