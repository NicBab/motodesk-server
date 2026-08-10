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
  const token = generateRandomToken();
  const tokenHash = hashToken(token);

  const expiresAt = new Date(
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
  const token = generateRandomToken();
  const tokenHash = hashToken(token);

  const expiresAt = new Date(
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
