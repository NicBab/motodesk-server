import {
  AuthTokenType,
} from "../../generated/prisma/client.js";

import {
  consumeAuthTokenRecord,
  createAuthTokenRecord,
  deleteExpiredAuthTokenRecords,
  findValidAuthTokenRecord,
  invalidateUserAuthTokens,
} from "./auth-token.repository.js";

import {
  generateEmailVerificationToken,
  generatePasswordResetToken,
} from "./token.service.js";

import {
  hashToken,
} from "./auth.utils.js";

//************************************************************** */

export interface CreatedAuthToken {
  token: string;
  expiresAt: Date;
}

//************************************************************** */

export async function createPasswordResetAuthToken(
  userId: string,
): Promise<CreatedAuthToken> {
  await invalidateUserAuthTokens(
    userId,
    AuthTokenType.PASSWORD_RESET,
  );

  const generatedToken =
    generatePasswordResetToken();

  await createAuthTokenRecord({
    userId,
    type:
      AuthTokenType.PASSWORD_RESET,
    tokenHash:
      generatedToken.tokenHash,
    expiresAt:
      generatedToken.expiresAt,
  });

  return {
    token: generatedToken.token,
    expiresAt:
      generatedToken.expiresAt,
  };
}

//************************************************************** */

export async function createEmailVerificationAuthToken(
  userId: string,
): Promise<CreatedAuthToken> {
  await invalidateUserAuthTokens(
    userId,
    AuthTokenType.EMAIL_VERIFICATION,
  );

  const generatedToken =
    generateEmailVerificationToken();

  await createAuthTokenRecord({
    userId,
    type:
      AuthTokenType.EMAIL_VERIFICATION,
    tokenHash:
      generatedToken.tokenHash,
    expiresAt:
      generatedToken.expiresAt,
  });

  return {
    token: generatedToken.token,
    expiresAt:
      generatedToken.expiresAt,
  };
}

//************************************************************** */

export async function validateEmailVerificationAuthToken(
  token: string,
) {
  const tokenHash =
    hashToken(token);

  return findValidAuthTokenRecord(
    tokenHash,
    AuthTokenType.EMAIL_VERIFICATION,
  );
}

//************************************************************** */

export async function consumeEmailVerificationAuthToken(
  authTokenId: string,
): Promise<void> {
  await consumeAuthTokenRecord(
    authTokenId,
  );
}

//************************************************************** */

export async function validatePasswordResetAuthToken(
  token: string,
) {
  const tokenHash =
    hashToken(token);

  return findValidAuthTokenRecord(
    tokenHash,
    AuthTokenType.PASSWORD_RESET,
  );
}

//************************************************************** */

export async function consumePasswordResetAuthToken(
  authTokenId: string,
): Promise<void> {
  await consumeAuthTokenRecord(
    authTokenId,
  );
}

//************************************************************** */

export async function deleteExpiredAuthTokens():
  Promise<number> {
  const result =
    await deleteExpiredAuthTokenRecords();

  return result.count;
}