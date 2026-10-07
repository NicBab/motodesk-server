//************************************************************** 
// This accepts only the admin access cookie, verifies its JWT and database session audience, 
// and loads the current user. The existing requirePlatformAdmin() middleware will continue checking 
// the active grant and verified email on every protected request.*/

import type { NextFunction, Response } from "express";

import {
  SessionAudience,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/auth.middleware.js";

import {
  findAuthenticatedUserById,
} from "../auth/shared/repositories/authenticated-request.repository.js";

import {
  validateAccessSession,
} from "../auth/sessions/session.service.js";

import {
  verifyAccessToken,
} from "../auth/tokens/jwt.service.js";

import {
  PLATFORM_ACCESS_TOKEN_COOKIE_NAME,
} from "./platform-auth.cookies.js";

//************************************************************** */

type RequestWithCookies = AuthenticatedRequest & {
  cookies?: Record<string, unknown>;
};

//************************************************************** */

export async function authenticatePlatformRequest(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  delete request.authenticatedUser;
  delete request.authenticationSessionId;
  delete request.accessTokenExpiresAt;

  request.authenticatedMembership = null;

  const cookieValue = (request as RequestWithCookies).cookies?.[
    PLATFORM_ACCESS_TOKEN_COOKIE_NAME
  ];

  if (typeof cookieValue !== "string" || cookieValue.length === 0) {
    next(
      new AppError(401, "Authentication required.", {
        code: "AUTHENTICATION_REQUIRED",
      }),
    );

    return;
  }

  let tokenPayload: ReturnType<typeof verifyAccessToken>;

  try {
    tokenPayload = verifyAccessToken(cookieValue);
  } catch {
    next(
      new AppError(401, "Access token is invalid or expired.", {
        code: "ACCESS_TOKEN_INVALID_OR_EXPIRED",
      }),
    );

    return;
  }

  try {
    const validatedSession = await validateAccessSession(
      tokenPayload.sessionId,
      tokenPayload.sub,
      SessionAudience.PLATFORM_ADMIN,
    );

    if (!validatedSession) {
      next(
        new AppError(401, "Session is invalid or expired.", {
          code: "AUTHENTICATION_SESSION_INVALID",
        }),
      );

      return;
    }

    const user = await findAuthenticatedUserById(tokenPayload.sub);

    if (!user || !user.isActive) {
      next(
        new AppError(401, "Account is unavailable.", {
          code: "ACCOUNT_UNAVAILABLE",
        }),
      );

      return;
    }

    request.authenticatedUser = user;

    request.authenticationSessionId = validatedSession.session.id;

    request.accessTokenExpiresAt = new Date(tokenPayload.exp * 1_000);
  } catch (error) {
    next(error);

    return;
  }

  next();
}

//************************************************************** */