// Refresh-session creation, rotation and revocation
import { randomUUID } from "node:crypto";
import {
  SessionRevocationReason,
  type Session,
} from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import type { RequestContext } from "./auth.types.js";
import {
  generateRefreshToken,
  type GeneratedRefreshToken,
} from "./token.service.js";
import { verifyTokenHash } from "./auth.utils.js";

export interface CreatedSession {
  session: Session;
  refreshToken: GeneratedRefreshToken;
}

export interface ValidatedSession {
  session: Session;
  refreshTokenSecret: string;
}

export async function createSession(
  userId: string,
  context: RequestContext,
): Promise<CreatedSession> {
  const sessionId = randomUUID();

  const refreshToken = generateRefreshToken(sessionId);

  const session = await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      tokenHash: refreshToken.tokenHash,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      expiresAt: refreshToken.expiresAt,
    },
  });

  return {
    session,
    refreshToken,
  };
}

export async function validateSession(
  sessionId: string,
  refreshTokenSecret: string,
): Promise<ValidatedSession | null> {
  const session = await prisma.session.findUnique({
    where: {
      id: sessionId,
    },
  });

  if (!session) {
    return null;
  }

  if (session.revokedAt !== null) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await revokeSession(
      session.id,
      SessionRevocationReason.EXPIRED,
    );

    return null;
  }

  const tokenMatches = verifyTokenHash(
    refreshTokenSecret,
    session.tokenHash,
  );

  if (!tokenMatches) {
    return null;
  }

  await prisma.session.update({
    where: {
      id: session.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  return {
    session,
    refreshTokenSecret,
  };
}

export async function rotateSessionToken(
  sessionId: string,
): Promise<GeneratedRefreshToken> {
  const refreshToken = generateRefreshToken(sessionId);

  await prisma.session.update({
    where: {
      id: sessionId,
    },
    data: {
      tokenHash: refreshToken.tokenHash,
      expiresAt: refreshToken.expiresAt,
      lastUsedAt: new Date(),
    },
  });

  return refreshToken;
}

export async function revokeSession(
  sessionId: string,
  reason: SessionRevocationReason,
): Promise<void> {
  await prisma.session.updateMany({
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

export async function revokeAllUserSessions(
  userId: string,
  reason: SessionRevocationReason,
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });

  return result.count;
}

export async function deleteExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lte: new Date(),
      },
    },
  });

  return result.count;
}