import { randomUUID } from "node:crypto";

import {
  SessionRevocationReason,
  type Session,
} from "../../../generated/prisma/client.js";

import type { RequestMetadata } from "../auth.types.js";

import {
  generateRefreshToken,
  type GeneratedRefreshToken,
} from "../tokens/refresh-token.service.js";

import { verifyTokenHash } from "../tokens/token.crypto.js";

import {
  createSessionRecord,
  deleteExpiredSessionRecords,
  findSessionById,
  findActiveSessionsForUser,
  revokeSessionRecord,
  revokeUserSessionRecords,
  rotateSessionRecord,
  touchSession,
} from "./session.repository.js";

import { AppError } from "../../../platform/errors/app-error.js";

import { logger } from "../../../config/logger.js";

//************************************************************** */

export interface CreatedSession {
  session: Session;
  refreshToken: GeneratedRefreshToken;
}

export interface ValidatedSession {
  session: Session;
  refreshTokenSecret: string;
}

export interface ValidatedAccessSession {
  session: Session;
}

export interface RevokeUserSessionsResult {
  revokedSessionCount: number;
}

//************************************************************** */

export async function createSession(
  userId: string,
  context: RequestMetadata,
): Promise<CreatedSession> {
  const sessionId = randomUUID();

  const refreshToken = generateRefreshToken(sessionId);

  const session = await createSessionRecord({
    id: sessionId,
    userId,
    tokenHash: refreshToken.tokenHash,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    expiresAt: refreshToken.expiresAt,
  });

  return {
    session,
    refreshToken,
  };
}

//************************************************************** */

export async function validateSession(
  sessionId: string,
  refreshTokenSecret: string,
): Promise<ValidatedSession | null> {
  const session = await findSessionById(sessionId);

  if (!session) {
    return null;
  }

  if (session.revokedAt !== null) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await revokeSession(session.id, SessionRevocationReason.EXPIRED);

    return null;
  }

  const currentTokenMatches = verifyTokenHash(
    refreshTokenSecret,
    session.tokenHash,
  );

  if (currentTokenMatches) {
    await touchSession(session.id);

    return {
      session,
      refreshTokenSecret,
    };
  }

  //************************************************************** */
  // Refresh tokens are rotated after every successful refresh.
  //
  // If the presented secret matches the immediately previous token,
  // that token has already been successfully used once. Seeing it
  // again indicates replay/reuse rather than an ordinary invalid
  // token.

  if (session.previousTokenHash) {
    const previousTokenMatches = verifyTokenHash(
      refreshTokenSecret,
      session.previousTokenHash,
    );

    if (previousTokenMatches) {
      await revokeSession(session.id, SessionRevocationReason.TOKEN_REUSE);

      logger.warn("Refresh token reuse detected", {
        securityEvent: "REFRESH_TOKEN_REUSE",

        userId: session.userId,

        sessionId: session.id,
      });

      return null;
    }
  }

  // Unknown token. Do not classify arbitrary invalid credentials
  // as confirmed refresh-token reuse.

  return null;
}

//************************************************************** */

export async function validateAccessSession(
  sessionId: string,
  userId: string,
): Promise<ValidatedAccessSession | null> {
  const session = await findSessionById(sessionId);

  if (!session) {
    return null;
  }

  if (session.userId !== userId) {
    return null;
  }

  if (session.revokedAt !== null) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await revokeSession(session.id, SessionRevocationReason.EXPIRED);

    return null;
  }

  await touchSession(session.id);

  return {
    session,
  };
}

//************************************************************** */

export async function rotateSessionToken(
  sessionId: string,
): Promise<GeneratedRefreshToken> {
  const refreshToken = generateRefreshToken(sessionId);

  await rotateSessionRecord(
    sessionId,
    refreshToken.tokenHash,
    refreshToken.expiresAt,
  );

  return refreshToken;
}

//************************************************************** */

export async function revokeSession(
  sessionId: string,
  reason: SessionRevocationReason,
): Promise<void> {
  await revokeSessionRecord(sessionId, reason);
}

//************************************************************** */

export async function revokeUserSessions(
  userId: string,
  reason: SessionRevocationReason,
  excludedSessionId?: string,
): Promise<RevokeUserSessionsResult> {
  const result = await revokeUserSessionRecords(
    userId,
    reason,
    excludedSessionId,
  );

  return {
    revokedSessionCount: result.count,
  };
}

//************************************************************** */

export async function revokeAllUserSessions(
  userId: string,
  reason: SessionRevocationReason,
): Promise<number> {
  const result = await revokeUserSessionRecords(userId, reason);

  return result.count;
}

//************************************************************** */

export async function getActiveSessionsForUser(
  userId: string,
  currentSessionId: string,
) {
  const sessions = await findActiveSessionsForUser(userId);

  return sessions.map((session) => ({
    id: session.id,

    userAgent: session.userAgent,

    ipAddress: session.ipAddress,

    createdAt: session.createdAt,

    lastUsedAt: session.lastUsedAt,

    expiresAt: session.expiresAt,

    isCurrent: session.id === currentSessionId,
  }));
}

//************************************************************** */

export async function revokeUserSession(
  userId: string,
  sessionId: string,
  currentSessionId: string,
): Promise<void> {
  if (sessionId === currentSessionId) {
    throw new AppError(
      400,
      "The current session cannot be revoked from this action.",
      {
        code: "CURRENT_SESSION_REVOKE_NOT_ALLOWED",
      },
    );
  }

  const sessions = await findActiveSessionsForUser(userId);

  const session = sessions.find((candidate) => candidate.id === sessionId);

  if (!session) {
    throw new AppError(404, "Session not found.", {
      code: "SESSION_NOT_FOUND",
    });
  }

  await revokeSession(session.id, SessionRevocationReason.LOGOUT);
}

//************************************************************** */

export async function revokeOtherUserSessions(
  userId: string,
  currentSessionId: string,
): Promise<RevokeUserSessionsResult> {
  return revokeUserSessions(
    userId,
    SessionRevocationReason.LOGOUT_ALL,
    currentSessionId,
  );
}

//************************************************************** */

export async function deleteExpiredSessions(): Promise<number> {
  const result = await deleteExpiredSessionRecords();

  return result.count;
}
