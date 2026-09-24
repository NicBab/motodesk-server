import type { AuthenticatedUser } from "../../auth.types.js";

import { updateUserProfileRecord } from "./repository.js";

import type { UpdateProfileInput } from "./schema.js";

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

    ...(input.jobTitle !== undefined
      ? {
          jobTitle: input.jobTitle,
        }
      : {}),

    ...(input.preferredTimezone !== undefined
      ? {
          preferredTimezone: input.preferredTimezone,
        }
      : {}),

    ...(input.displayMode !== undefined
      ? {
          displayMode: input.displayMode,
        }
      : {}),
  });

  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    jobTitle: user.jobTitle,
    preferredTimezone: user.preferredTimezone,
    displayMode: user.displayMode,
    isActive: user.isActive,
  };
}

//************************************************************** */