//************************************************************** 
// Client logout now requires a CLIENT session and a matching current or 
// immediately previous refresh-token secret. It cannot revoke an admin session. 
// Repeated logout remains idempotent.*/

import {
  SessionAudience,
  SessionRevocationReason,
} from "../../../../generated/prisma/client.js";

import { AppError } from "../../../../platform/errors/app-error.js";

import {
  parseRefreshToken,
} from "../../tokens/refresh-token.service.js";

import { verifyTokenHash } from "../../tokens/token.crypto.js";

import {
  findSessionById,
} from "../../sessions/session.repository.js";

import { revokeSession } from "../../sessions/session.service.js";

//************************************************************** */

export type LogoutResult = {
  sessionId: string;
  userId: string;
};

//************************************************************** */

export async function logoutUser(
  refreshToken: string,
): Promise<LogoutResult> {
  const parsedRefreshToken = parseRefreshToken(refreshToken);

  const session = await findSessionById(
    parsedRefreshToken.sessionId,
  );

  // Preserve idempotent logout when the session has been deleted.
  // There is no session to revoke or user to attribute an event to.
  if (!session) {
    return {
      sessionId: parsedRefreshToken.sessionId,
      userId: "",
    };
  }

  // Check audience before inspecting credentials or changing state.
  if (session.audience !== SessionAudience.CLIENT) {
    throw new AppError(401, "Session has expired or is invalid.", {
      code: "SESSION_INVALID",
    });
  }

  const currentTokenMatches = verifyTokenHash(
    parsedRefreshToken.secret,
    session.tokenHash,
  );

  const previousTokenMatches =
    session.previousTokenHash !== null &&
    verifyTokenHash(
      parsedRefreshToken.secret,
      session.previousTokenHash,
    );

  if (!currentTokenMatches && !previousTokenMatches) {
    throw new AppError(401, "Session has expired or is invalid.", {
      code: "SESSION_INVALID",
    });
  }

  // A previous token can terminate the session after a refresh race.
  // It cannot refresh the session or establish new credentials.
  if (session.revokedAt !== null) {
    return {
      sessionId: session.id,
      userId: "",
    };
  }

  await revokeSession(
    session.id,
    SessionRevocationReason.LOGOUT,
  );

  return {
    sessionId: session.id,
    userId: session.userId,
  };
}

//************************************************************** */