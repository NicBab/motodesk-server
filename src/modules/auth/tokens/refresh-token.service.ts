//refresh token generation/parsing

import {
  REFRESH_TOKEN_TTL_MILLISECONDS,
} from "../auth.constants.js";

import type {
  RefreshTokenParts,
} from "../auth.types.js";

import {
  buildRefreshToken,
  generateRandomToken,
  hashToken,
  splitRefreshToken,
} from "./token.crypto.js";

//************************************************************** */

export interface GeneratedRefreshToken {
  token: string;
  secret: string;
  tokenHash: string;
  expiresAt: Date;
}

//************************************************************** */

export function generateRefreshToken(
  sessionId: string,
): GeneratedRefreshToken {
  const secret =
    generateRandomToken();

  const token =
    buildRefreshToken(
      sessionId,
      secret,
    );

  const tokenHash =
    hashToken(secret);

  const expiresAt = new Date(
    Date.now() +
      REFRESH_TOKEN_TTL_MILLISECONDS,
  );

 return {
  token,
  secret,
  tokenHash,
  expiresAt,
};
}

//************************************************************** */

export function parseRefreshToken(
  refreshToken: string,
): RefreshTokenParts {
  return splitRefreshToken(
    refreshToken,
  );
}