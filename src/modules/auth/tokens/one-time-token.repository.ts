import {
  AuthTokenType,
} from "../../../generated/prisma/client.js";

import {
  prisma,
} from "../../../config/prisma.js";

//************************************************************** */

export interface CreateAuthTokenRecordData {
  userId: string;
  type: AuthTokenType;
  tokenHash: string;
  expiresAt: Date;
}

//************************************************************** */

export async function createAuthTokenRecord(
  data: CreateAuthTokenRecordData,
) {
  return prisma.authToken.create({
    data: {
      userId: data.userId,
      type: data.type,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    },
  });
}

//************************************************************** */

export async function findValidAuthTokenRecord(
  tokenHash: string,
  type: AuthTokenType,
) {
  return prisma.authToken.findFirst({
    where: {
      tokenHash,
      type,
      usedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
  });
}

//************************************************************** */

export async function consumeAuthTokenRecord(
  authTokenId: string,
) {
  return prisma.authToken.update({
    where: {
      id: authTokenId,
    },
    data: {
      usedAt: new Date(),
    },
  });
}

//************************************************************** */

export async function invalidateUserAuthTokens(
  userId: string,
  type: AuthTokenType,
) {
  return prisma.authToken.updateMany({
    where: {
      userId,
      type,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });
}

//************************************************************** */

export async function deleteExpiredAuthTokenRecords() {
  return prisma.authToken.deleteMany({
    where: {
      expiresAt: {
        lte: new Date(),
      },
    },
  });
}