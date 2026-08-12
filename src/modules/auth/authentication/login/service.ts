import { AppError } from "../../../../platform/errors/app-error.js";

import { findUserForLogin } from "../../auth.repository.js";

import { verifyPassword } from "../../password.service.js";

import { createAuthenticationResult } from "../../shared/authentication-result.builder.js";

import type { LoginInput } from "./schema.js";

import type { AuthenticationResult, RequestContext } from "../../auth.types.js";

//************************************************************** */

export async function loginUser(
  input: LoginInput,
  context: RequestContext,
): Promise<AuthenticationResult> {
  const user = await findUserForLogin(input.email);

  if (!user) {
    throw new AppError(401, "Invalid email address or password.", {
      code: "INVALID_CREDENTIALS",
    });
  }

  if (!user.isActive) {
    throw new AppError(403, "This account is currently inactive.", {
      code: "ACCOUNT_INACTIVE",
    });
  }

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new AppError(401, "Invalid email address or password.", {
      code: "INVALID_CREDENTIALS",
    });
  }

  const membership = user.memberships[0] ?? null;

  return createAuthenticationResult(user, membership, context);
}

//************************************************************** */
