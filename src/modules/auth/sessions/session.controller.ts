import type { Response } from "express";

import { AppError } from "../../../platform/errors/app-error.js";

import { ok } from "../../../platform/http/api-response.js";

import type { AuthenticatedRequest } from "../auth.middleware.js";

import {
  getActiveSessionsForUser,
  revokeOtherUserSessions,
  revokeUserSession,
} from "./session.service.js";

//************************************************************** */

export async function getActiveSessionsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  const currentSessionId = request.authenticationSessionId;

  if (!userId || !currentSessionId) {
    throw new AppError(401, "Authentication session is unavailable.", {
      code: "AUTHENTICATION_SESSION_INVALID",
    });
  }

  const sessions = await getActiveSessionsForUser(userId, currentSessionId);

  ok(response, {
    sessions,
  });
}

//************************************************************** */

export async function revokeSessionHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  const currentSessionId = request.authenticationSessionId;

  const sessionIdParam = request.params.sessionId;

  const sessionId = Array.isArray(sessionIdParam)
    ? sessionIdParam[0]
    : sessionIdParam;

  if (!userId || !currentSessionId) {
    throw new AppError(401, "Authentication session is unavailable.", {
      code: "AUTHENTICATION_SESSION_INVALID",
    });
  }

  if (!sessionId) {
    throw new AppError(400, "Session ID is required.", {
      code: "SESSION_ID_REQUIRED",
    });
  }

  await revokeUserSession(userId, sessionId, currentSessionId);

  ok(response, {
    message: "Session revoked.",
  });
}

//************************************************************** */

export async function revokeOtherSessionsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  const currentSessionId = request.authenticationSessionId;

  if (!userId || !currentSessionId) {
    throw new AppError(401, "Authentication session is unavailable.", {
      code: "AUTHENTICATION_SESSION_INVALID",
    });
  }

  const result = await revokeOtherUserSessions(userId, currentSessionId);

  ok(response, {
    revokedSessionCount: result.revokedSessionCount,
  });
}

//************************************************************** */
