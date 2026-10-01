import type { Response } from "express";

import { AppError } from "../../../platform/errors/app-error.js";

import { ok } from "../../../platform/http/api-response.js";

import { getRequestMetadata } from "../../../platform/request/request.metadata.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../audit/audit.constants.js";

import { createAuditLog } from "../../audit/audit.service.js";

import type { AuthenticatedRequest } from "../auth.middleware.js";

import {
  getActiveSessionsForUser,
  revokeOtherUserSessions,
  revokeUserSession,
} from "./session.service.js";

//************************************************************** */

function getAuditContext(request: AuthenticatedRequest) {
  const context = getRequestMetadata(request);

  return {
    ...(context.ipAddress !== null
      ? {
          ipAddress: context.ipAddress,
        }
      : {}),

    ...(context.userAgent !== null
      ? {
          userAgent: context.userAgent,
        }
      : {}),
  };
}

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

  const organizationId = request.authenticatedMembership?.organizationId;

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

  //************************************************************** */

  await revokeUserSession(userId, sessionId, currentSessionId);

  //************************************************************** */
  // The authenticated user explicitly terminated another session.

  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_LOGOUT,

    entityType: AUDIT_ENTITY_TYPES.SESSION,

    entityId: sessionId,

    actor: {
      userId,

      sessionId: currentSessionId,

      ...(organizationId
        ? {
            organizationId,
          }
        : {}),
    },

    context: getAuditContext(request),

    metadata: {
      scope: "INDIVIDUAL_SESSION",

      currentSessionId,
    },
  });

  //************************************************************** */

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

  const organizationId = request.authenticatedMembership?.organizationId;

  const currentSessionId = request.authenticationSessionId;

  if (!userId || !currentSessionId) {
    throw new AppError(401, "Authentication session is unavailable.", {
      code: "AUTHENTICATION_SESSION_INVALID",
    });
  }

  //************************************************************** */

  const result = await revokeOtherUserSessions(userId, currentSessionId);

  //************************************************************** */

  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_LOGOUT_ALL,

    entityType: AUDIT_ENTITY_TYPES.SESSION,

    entityId: currentSessionId,

    actor: {
      userId,

      sessionId: currentSessionId,

      ...(organizationId
        ? {
            organizationId,
          }
        : {}),
    },

    context: getAuditContext(request),

    metadata: {
      scope: "OTHER_SESSIONS",

      revokedSessionCount: result.revokedSessionCount,
    },
  });

  //************************************************************** */

  ok(response, {
    revokedSessionCount: result.revokedSessionCount,
  });
}

//************************************************************** */
