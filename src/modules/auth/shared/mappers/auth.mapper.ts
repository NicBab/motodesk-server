import type { User } from "../../../../generated/prisma/client.js";

import type { AuthenticatedUser } from "../../auth.types.js";

//************************************************************** */

export type UserWithPassword = Pick<
  User,
  | "id"
  | "email"
  | "emailVerifiedAt"
  | "passwordHash"
  | "firstName"
  | "lastName"
  | "phone"
  | "jobTitle"
  | "preferredTimezone"
  | "displayMode"
  | "isActive"
>;

//************************************************************** */

export function toAuthenticatedUser(user: UserWithPassword): AuthenticatedUser {
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
