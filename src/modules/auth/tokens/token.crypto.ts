//random/hash/split/build helpers

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  REFRESH_TOKEN_BYTE_LENGTH,
  TOKEN_HASH_ALGORITHM,
} from "../auth.constants.js";

//************************************************************** */
export function generateRandomToken(
  byteLength = REFRESH_TOKEN_BYTE_LENGTH,
): string {
  return randomBytes(byteLength).toString("hex");
}

//************************************************************** */

export function hashToken(token: string): string {
  return createHash(TOKEN_HASH_ALGORITHM).update(token).digest("hex");
}

//************************************************************** */
export function verifyTokenHash(token: string, storedHash: string): boolean {
  const computedHash = hashToken(token);

  const computedBuffer = Buffer.from(computedHash, "hex");
  const storedBuffer = Buffer.from(storedHash, "hex");

  if (computedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedBuffer, storedBuffer);
}

//************************************************************** */

export function splitRefreshToken(refreshToken: string): {
  sessionId: string;
  secret: string;
} {
  const separatorIndex = refreshToken.indexOf(".");

  if (separatorIndex === -1) {
    throw new Error("Invalid refresh token format.");
  }

  return {
    sessionId: refreshToken.slice(0, separatorIndex),
    secret: refreshToken.slice(separatorIndex + 1),
  };
}

//************************************************************** */
export function buildRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

//************************************************************** */
