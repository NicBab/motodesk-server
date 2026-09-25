import { logger } from "../../../../config/logger.js";

import { AppError } from "../../../../platform/errors/app-error.js";

import { findUserForLogin } from "../../shared/repositories/user-auth.repository.js";

import { verifyPassword } from "../../security/password.service.js";

import { createAuthenticationResult } from "../../shared/authentication-result.builder.js";

import type { LoginInput } from "./schema.js";

import type {
  AuthenticationResult,
  RequestMetadata,
} from "../../auth.types.js";

//************************************************************** */

export async function loginUser(
  input: LoginInput,
  context: RequestMetadata,
): Promise<AuthenticationResult> {
  const user = await findUserForLogin(input.email);

  if (!user) {
    logger.warn("Authentication failed", {
      reason: "USER_NOT_FOUND",

      ipAddress: context.ipAddress,

      userAgent: context.userAgent,
    });

    throw new AppError(401, "Invalid email address or password.", {
      code: "INVALID_CREDENTIALS",
    });
  }

  if (!user.isActive) {
    logger.warn("Authentication failed", {
      reason: "ACCOUNT_INACTIVE",

      userId: user.id,

      ipAddress: context.ipAddress,

      userAgent: context.userAgent,
    });

    throw new AppError(403, "This account is currently inactive.", {
      code: "ACCOUNT_INACTIVE",
    });
  }

  //************************************************************** */
  // OAuth-only accounts do not have a local password.
  //
  // Keep the response identical to an incorrect password so the
  // endpoint does not disclose which authentication methods are
  // configured for an account.

  if (!user.passwordHash) {
    logger.warn("Authentication failed", {
      reason: "LOCAL_PASSWORD_UNAVAILABLE",

      userId: user.id,

      ipAddress: context.ipAddress,

      userAgent: context.userAgent,
    });

    throw new AppError(401, "Invalid email address or password.", {
      code: "INVALID_CREDENTIALS",
    });
  }

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    logger.warn("Authentication failed", {
      reason: "INVALID_PASSWORD",

      userId: user.id,

      ipAddress: context.ipAddress,

      userAgent: context.userAgent,
    });

    throw new AppError(401, "Invalid email address or password.", {
      code: "INVALID_CREDENTIALS",
    });
  }

  const membership = user.memberships[0] ?? null;

  return createAuthenticationResult(user, membership, context);
}

//************************************************************** */
