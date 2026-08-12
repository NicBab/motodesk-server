import {
  SessionRevocationReason,
} from "../../../generated/prisma/client.js";

import {
  prisma,
} from "../../../config/prisma.js";

//************************************************************** */

export interface CreateSessionRecordData {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
}

//************************************************************** */

export async function createSessionRecord(
  data: CreateSessionRecordData,
) {
  return prisma.session.create({
    data: {
      id: data.id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress,
      expiresAt: data.expiresAt,
    },
  });
}

//************************************************************** */

export async function findSessionById(
  sessionId: string,
) {
  return prisma.session.findUnique({
    where: {
      id: sessionId,
    },
  });
}

//************************************************************** */

export async function touchSession(
  sessionId: string,
) {
  return prisma.session.update({
    where: {
      id: sessionId,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });
}

//************************************************************** */

export async function rotateSessionRecord(
  sessionId: string,
  tokenHash: string,
  expiresAt: Date,
) {
  return prisma.session.update({
    where: {
      id: sessionId,
    },
    data: {
      tokenHash,
      expiresAt,
      lastUsedAt: new Date(),
    },
  });
}

//************************************************************** */

export async function revokeSessionRecord(
  sessionId: string,
  reason: SessionRevocationReason,
) {
  return prisma.session.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });
}

//************************************************************** */

export async function revokeUserSessionRecords(
  userId: string,
  reason: SessionRevocationReason,
  excludedSessionId?: string,
) {
  return prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,

      ...(excludedSessionId !== undefined
        ? {
            id: {
              not: excludedSessionId,
            },
          }
        : {}),
    },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });
}

//************************************************************** */

export async function deleteExpiredSessionRecords() {
  return prisma.session.deleteMany({
    where: {
      expiresAt: {
        lte: new Date(),
      },
    },
  });
}