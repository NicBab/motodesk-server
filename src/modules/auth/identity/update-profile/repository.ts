import { prisma } from "../../../../config/prisma.js";

import { authenticationUserSelect } from "../../shared/repositories/user-auth.repository.js";

//************************************************************** */

export interface UpdateUserProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

//************************************************************** */

export async function updateUserProfileRecord(
  userId: string,
  data: UpdateUserProfileData,
) {
  return prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      ...(data.firstName !== undefined
        ? {
            firstName: data.firstName,
          }
        : {}),

      ...(data.lastName !== undefined
        ? {
            lastName: data.lastName,
          }
        : {}),

      ...(data.phone !== undefined
        ? {
            phone: data.phone,
          }
        : {}),
    },
    select: authenticationUserSelect,
  });
}

//************************************************************** */
