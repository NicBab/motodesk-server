import {
  prisma,
} from "../../../../config/prisma.js";

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
