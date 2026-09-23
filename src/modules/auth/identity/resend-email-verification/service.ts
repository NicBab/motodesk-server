import {
  findUserForLogin,
} from "../../shared/repositories/user-auth.repository.js";

import {
  createEmailVerificationAuthToken,
} from "../../tokens/one-time-token.service.js";

import type {
  ResendEmailVerificationInput,
} from "./schema.js";

import {
  sendEmailVerificationCode,
} from "../../../../platform/email/auth-email.service.js";

//************************************************************** */

export interface ResendEmailVerificationResult {
  message: string;
}

//************************************************************** */

export async function resendEmailVerification(
  input: ResendEmailVerificationInput,
): Promise<ResendEmailVerificationResult> {
  const genericMessage =
    "If an eligible account exists for this email address, verification instructions have been sent.";

  const user =
    await findUserForLogin(
      input.email,
    );

  //************************************************************** */
  // Always return the same response for unknown, inactive, or
  // already-verified accounts to avoid exposing account state.

  if (
    !user ||
    !user.isActive
  ) {
    return {
      message:
        genericMessage,
    };
  }

  if (
    user.emailVerifiedAt
  ) {
    return {
      message:
        genericMessage,
    };
  }

  //************************************************************** */
  // Creating the replacement token invalidates the previous
  // verification token and persists only the hash of the new code.

  const verificationToken =
    await createEmailVerificationAuthToken(
      user.id,
    );

  //************************************************************** */
  // Deliver the plaintext six-digit code only after its hashed
  // representation has been persisted.

  await sendEmailVerificationCode({
    email:
      user.email,

    firstName:
      user.firstName,

    verificationCode:
      verificationToken.token,
  });

  //************************************************************** */
  // Never return the verification code through the HTTP API,
  // including in development.

  return {
    message:
      genericMessage,
  };
}

//************************************************************** */