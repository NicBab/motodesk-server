import { AppError } from "../../../../platform/errors/app-error.js";

import { findUserPasswordById } from "../../identity/change-password/repository.js";

import { verifyPassword } from "../../security/password.service.js";

import { markSessionReauthenticated } from "../../sessions/session.service.js";

import type { ReauthenticateInput } from "./schema.js";

//************************************************************** */

export async function reauthenticateUser(
  userId: string,
  sessionId: string,
  input: ReauthenticateInput,
): Promise<void> {
  const user =
    await findUserPasswordById(
      userId,
    );

  if (!user) {
    throw new AppError(
      404,
      "User account not found.",
      {
        code:
          "USER_NOT_FOUND",
      },
    );
  }

  if (!user.isActive) {
    throw new AppError(
      403,
      "This account is currently inactive.",
      {
        code:
          "ACCOUNT_INACTIVE",
      },
    );
  }

  //************************************************************** */
  // Password reauthentication is available only to accounts that
  // currently have a local password configured.
  //
  // OAuth-only accounts require an identity-provider-specific
  // step-up authentication flow.

  if (!user.passwordHash) {
    throw new AppError(
      400,
      "This account does not have a password configured.",
      {
        code:
          "PASSWORD_NOT_CONFIGURED",
      },
    );
  }

  const passwordMatches =
    await verifyPassword(
      input.currentPassword,
      user.passwordHash,
    );

  if (!passwordMatches) {
    throw new AppError(
      401,
      "Current password is incorrect.",
      {
        code:
          "CURRENT_PASSWORD_INCORRECT",
      },
    );
  }

  //************************************************************** */
  // Only a successful credential challenge may advance the
  // security-significant authentication timestamp.

  await markSessionReauthenticated(
    sessionId,
  );
}

//************************************************************** */