//**************************************************************
// Existing callers default to CLIENT. Admin callers will explicitly pass PLATFORM_ADMIN, 
// and rotation checks the audience atomically alongside the token hash. 
// Account-wide revocation still covers both audiences. */

import {
  SessionAudience,
  SessionRevocationReason,
} from "../../../generated/prisma/client.js";

import { prisma } from "../../../config/prisma.js";

//************************************************************** */

export interface CreateSessionRecordData {
  id: string;

  userId: string;

  audience?: SessionAudience;

  tokenHash: string;

  userAgent: string | null;

  ipAddress: string | null;

  expiresAt: Date;
}

//************************************************************** */

export async function createSessionRecord(data: CreateSessionRecordData) {
  return prisma.session.create({
    data: {
      id: data.id,

      userId: data.userId,

      audience: data.audience ?? SessionAudience.CLIENT,

      tokenHash: data.tokenHash,

      userAgent: data.userAgent,

      ipAddress: data.ipAddress,

      expiresAt: data.expiresAt,
    },
  });
}

//************************************************************** */

export async function findSessionById(sessionId: string) {
  return prisma.session.findUnique({
    where: {
      id: sessionId,
    },
  });
}

//************************************************************** */

export async function findActiveSessionsForUser(userId: string) {
  return prisma.session.findMany({
    where: {
      userId,

      revokedAt: null,

      expiresAt: {
        gt: new Date(),
      },
    },

    select: {
      id: true,

      userAgent: true,

      ipAddress: true,

      expiresAt: true,

      lastUsedAt: true,

      lastAuthenticatedAt: true,

      createdAt: true,
    },

    orderBy: {
      lastUsedAt: "desc",
    },
  });
}

//************************************************************** */

export async function touchSession(sessionId: string) {
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

export async function updateSessionLastAuthenticatedAt(
  sessionId: string,
) {
  return prisma.session.updateMany({
    where: {
      id: sessionId,

      revokedAt: null,

      expiresAt: {
        gt: new Date(),
      },
    },

    data: {
      lastAuthenticatedAt: new Date(),
    },
  });
}

//************************************************************** */

export async function rotateSessionRecord(
  sessionId: string,
  expectedTokenHash: string,
  tokenHash: string,
  expiresAt: Date,
  audience: SessionAudience = SessionAudience.CLIENT,
) {
  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,

      audience,

      tokenHash: expectedTokenHash,

      revokedAt: null,

      expiresAt: {
        gt: new Date(),
      },
    },

    data: {
      previousTokenHash: expectedTokenHash,

      tokenHash,

      expiresAt,

      lastUsedAt: new Date(),
    },
  });

  return {
    rotated: result.count === 1,
  };
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

//************************************************************** */