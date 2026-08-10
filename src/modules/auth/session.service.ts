// Refresh-session creation, rotation and revocation

import { randomUUID } from "node:crypto";

import {
  SessionRevocationReason,
  type Session,
} from "../../generated/prisma/client.js";

import type { RequestContext } from "./auth.types.js";

import {
  generateRefreshToken,
  type GeneratedRefreshToken,
} from "./tokens/refresh-token.service.js";

import {
  verifyTokenHash,
} from "./tokens/token.crypto.js";

import {
  createSessionRecord,
  deleteExpiredSessionRecords,
  findSessionById,
  revokeSessionRecord,
  revokeUserSessionRecords,
  rotateSessionRecord,
  touchSession,
} from "./session.repository.js";

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
  context: RequestContext,
): Promise<CreatedSession> {
  const sessionId = randomUUID();

  const refreshToken =
    generateRefreshToken(sessionId);

  const session =
    await createSessionRecord({
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
  const session =
    await findSessionById(sessionId);

  if (!session) {
    return null;
  }

  if (session.revokedAt !== null) {
    return null;
  }

  if (
    session.expiresAt.getTime() <=
    Date.now()
  ) {
    await revokeSession(
      session.id,
      SessionRevocationReason.EXPIRED,
    );

    return null;
  }

  const tokenMatches =
    verifyTokenHash(
      refreshTokenSecret,
      session.tokenHash,
    );

  if (!tokenMatches) {
    return null;
  }

  await touchSession(session.id);

  return {
    session,
    refreshTokenSecret,
  };
}

//************************************************************** */

export async function validateAccessSession(
  sessionId: string,
  userId: string,
): Promise<ValidatedAccessSession | null> {
  const session =
    await findSessionById(sessionId);

  if (!session) {
    return null;
  }

  if (session.userId !== userId) {
    return null;
  }

  if (session.revokedAt !== null) {
    return null;
  }

  if (
    session.expiresAt.getTime() <=
    Date.now()
  ) {
    await revokeSession(
      session.id,
      SessionRevocationReason.EXPIRED,
    );

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
  const refreshToken =
    generateRefreshToken(sessionId);

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
  await revokeSessionRecord(
    sessionId,
    reason,
  );
}

//************************************************************** */

export async function revokeUserSessions(
  userId: string,
  reason: SessionRevocationReason,
  excludedSessionId?: string,
): Promise<RevokeUserSessionsResult> {
  const result =
    await revokeUserSessionRecords(
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
  const result =
    await revokeUserSessionRecords(
      userId,
      reason,
    );

  return result.count;
}

//************************************************************** */

export async function deleteExpiredSessions(): Promise<number> {
  const result =
    await deleteExpiredSessionRecords();

  return result.count;
}