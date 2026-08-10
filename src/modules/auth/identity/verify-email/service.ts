import { AppError } from "../../../../platform/errors/app-error.js";

import {
  consumeEmailVerificationAuthToken,
  validateEmailVerificationAuthToken,
} from "../../tokens/one-time-token.service.js";

import {
  markUserEmailVerified,
} from "./repository.js";

import type {
  VerifyEmailInput,
} from "./schema.js";

//************************************************************** */

export async function verifyEmail(
  input: VerifyEmailInput,
): Promise<void> {
  const authToken =
    await validateEmailVerificationAuthToken(
      input.token,
    );

  if (!authToken) {
    throw new AppError(
      400,
      "Email verification token is invalid or expired.",
      {
        code:
          "EMAIL_VERIFICATION_TOKEN_INVALID",
      },
    );
  }

  await markUserEmailVerified(
    authToken.userId,
  );

  await consumeEmailVerificationAuthToken(
    authToken.id,
  );
}