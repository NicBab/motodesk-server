import type {
  Response,
} from "express";

import {
  AppError,
} from "../../../../platform/errors/app-error.js";

import {
  ok,
} from "../../../../platform/http/api-response.js";

import {
  getRequestMetadata,
} from "../../../../platform/request/request.metadata.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../audit/audit.constants.js";

import {
  createAuditLog,
} from "../../../audit/audit.service.js";

import type {
  AuthenticatedRequest,
} from "../../auth.middleware.js";

import {
  clearAuthenticationCookies,
} from "../../http/cookie.service.js";

import {
  logoutAllUserSessions,
} from "./service.js";

//************************************************************** */

export async function logoutAll(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId =
    request.authenticatedUser?.id;

  const organizationId =
    request.authenticatedMembership
      ?.organizationId;

  const currentSessionId =
    request.authenticationSessionId;

  if (
    !userId
  ) {
    throw new AppError(
      401,
      "Authentication required.",
      {
        code:
          "AUTHENTICATION_REQUIRED",
      },
    );
  }

  if (
    !currentSessionId
  ) {
    throw new AppError(
      401,
      "Authentication session is unavailable.",
      {
        code:
          "AUTHENTICATION_SESSION_INVALID",
      },
    );
  }

  //************************************************************** */
  // Revoke every active session first.
  //
  // Audit evidence is written only after the security operation
  // succeeds so a failed revocation cannot produce a false success
  // event.

  const revokedSessionCount =
    await logoutAllUserSessions(
      userId,
    );

  //************************************************************** */

  const requestMetadata =
    getRequestMetadata(
      request,
    );

  await createAuditLog({
    action:
      AUDIT_ACTIONS.AUTH_LOGOUT_ALL,

    entityType:
      AUDIT_ENTITY_TYPES.SESSION,

    entityId:
      currentSessionId,

    actor: {
      userId,

      sessionId:
        currentSessionId,

      ...(organizationId
        ? {
            organizationId,
          }
        : {}),
    },

    context: {
      ...(requestMetadata.ipAddress !== null
        ? {
            ipAddress:
              requestMetadata.ipAddress,
          }
        : {}),

      ...(requestMetadata.userAgent !== null
        ? {
            userAgent:
              requestMetadata.userAgent,
          }
        : {}),
    },

    metadata: {
      scope:
        "ALL_SESSIONS",

      revokedSessionCount,
    },
  });

  //************************************************************** */

  clearAuthenticationCookies(
    response,
  );

  ok(
    response,
    {
      revokedSessionCount,
    },
  );
}

//************************************************************** */