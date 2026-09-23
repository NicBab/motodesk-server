import {
  randomInt,
} from "node:crypto";

import {
  EMAIL_VERIFICATION_TTL_MILLISECONDS,
  PASSWORD_RESET_TTL_MILLISECONDS,
} from "../auth.constants.js";

import {
  generateRandomToken,
  hashToken,
} from "./token.crypto.js";

//************************************************************** */

export interface GeneratedOneTimeToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

//************************************************************** */

export function generatePasswordResetToken():
  GeneratedOneTimeToken {
  const token =
    generateRandomToken();

  const tokenHash =
    hashToken(
      token,
    );

  const expiresAt =
    new Date(
      Date.now() +
        PASSWORD_RESET_TTL_MILLISECONDS,
    );

  return {
    token,
    tokenHash,
    expiresAt,
  };
}

//************************************************************** */

export function generateEmailVerificationToken():
  GeneratedOneTimeToken {
  //************************************************************** */
  // Email verification intentionally uses a human-entered six-digit
  // code rather than the opaque tokens used for password recovery.
  //
  // randomInt() uses Node's cryptographically secure random source.
  // Leading zeroes are preserved by padding the numeric result.

  const token =
    randomInt(
      0,
      1_000_000,
    )
      .toString()
      .padStart(
        6,
        "0",
      );

  //************************************************************** */
  // Never persist the verification code itself. AuthToken continues
  // to contain only its hash.

  const tokenHash =
    hashToken(
      token,
    );

  const expiresAt =
    new Date(
      Date.now() +
        EMAIL_VERIFICATION_TTL_MILLISECONDS,
    );

  return {
    token,
    tokenHash,
    expiresAt,
  };
}

//************************************************************** */