import { randomUUID } from "node:crypto";

import type {
  NextFunction,
  Response,
} from "express";

import type {
  AuthenticatedRequest,
} from "../../modules/auth/auth.middleware.js";

import {
  runWithRequestContext,
} from "./request.context.js";

import type {
  RequestContext,
} from "./request.types.js";

//************************************************************** */

function getRequestId(
  request: AuthenticatedRequest,
): string {
  const headerValue =
    request.get("x-request-id");

  return headerValue?.trim() || randomUUID();
}

//************************************************************** */

function getIpAddress(
  request: AuthenticatedRequest,
): string | null {
  return request.ip || null;
}

//************************************************************** */

function getUserAgent(
  request: AuthenticatedRequest,
): string | null {
  return (
    request.get("user-agent") ?? null
  );
}

//************************************************************** */

export function initializeRequestContext(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void {
  const user =
    request.authenticatedUser;

  const sessionId =
    request.authenticationSessionId;

  if (!user || !sessionId) {
    response.status(401).json({
      success: false,
      message:
        "Authenticated request context could not be initialized.",
      code: "AUTHENTICATION_REQUIRED",
    });

    return;
  }

  const requestId =
    getRequestId(request);

  const context: RequestContext = {
    requestId,
    sessionId,
    ipAddress:
      getIpAddress(request),
    userAgent:
      getUserAgent(request),

    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
    },

    membership:
      request.authenticatedMembership
        ? {
            id:
              request.authenticatedMembership.id,
            organizationId:
              request.authenticatedMembership
                .organizationId,
            organizationName:
              request.authenticatedMembership
                .organizationName,
            role:
              request.authenticatedMembership.role,
            status:
              request.authenticatedMembership.status,
          }
        : null,
  };

  response.setHeader(
    "x-request-id",
    requestId,
  );

  runWithRequestContext(
    context,
    next,
  );
}

//************************************************************** */