import { env } from "../../../../config/env.js";

import {
  findUserForLogin,
} from "../../auth.repository.js";

import {
  createEmailVerificationAuthToken,
} from "../../auth-token.service.js";

import type {
  ResendEmailVerificationInput,
} from "./schema.js";

//************************************************************** */

export interface ResendEmailVerificationResult {
  message: string;
  emailVerificationToken?: string;
  emailVerificationExpiresAt?: Date;
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

  if (!user || !user.isActive) {
    return {
      message: genericMessage,
    };
  }

  if (user.emailVerifiedAt) {
    return {
      message: genericMessage,
    };
  }

  const verificationToken =
    await createEmailVerificationAuthToken(
      user.id,
    );

  return {
    message: genericMessage,

    ...(env.NODE_ENV === "development"
      ? {
          emailVerificationToken:
            verificationToken.token,
          emailVerificationExpiresAt:
            verificationToken.expiresAt,
        }
      : {}),
  };
}