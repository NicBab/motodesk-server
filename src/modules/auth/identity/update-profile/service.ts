import type { AuthenticatedUser } from "../../auth.types.js";
import type { UpdateProfileInput } from "../../auth.schemas.js";
import { updateUserProfileRecord } from "./repository.js";

//************************************************************** */

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<AuthenticatedUser> {
  const user = await updateUserProfileRecord(userId, {
    ...(input.firstName !== undefined
      ? {
          firstName: input.firstName,
        }
      : {}),

    ...(input.lastName !== undefined
      ? {
          lastName: input.lastName,
        }
      : {}),

    ...(input.phone !== undefined
      ? {
          phone: input.phone,
        }
      : {}),
  });

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    isActive: user.isActive,
  };
}
