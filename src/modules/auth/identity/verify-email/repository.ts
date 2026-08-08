import {
  prisma,
} from "../../../../config/prisma.js";

//************************************************************** */

export async function markUserEmailVerified(
  userId: string,
) {
  return prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      emailVerifiedAt:
        new Date(),
    },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
    },
  });
}