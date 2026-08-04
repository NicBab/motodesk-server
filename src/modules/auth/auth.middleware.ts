import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";
import {
  findAuthenticatedMembership,
  findAuthenticatedUserById,
} from "./auth.repository.js";
import { ACCESS_TOKEN_COOKIE_NAME } from "./auth.constants.js";
import type {
  AuthenticatedMembership,
  AuthenticatedUser,
} from "./auth.types.js";
import { validateAccessSession } from "./session.service.js";
import { verifyAccessToken } from "./token.service.js";

//************************************************************** */

export interface AuthenticatedRequest extends Request {
  authenticatedUser?: AuthenticatedUser;
  authenticatedMembership?: AuthenticatedMembership | null;
  authenticationSessionId?: string;
}

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

//************************************************************** */

function getAccessToken(request: Request): string | null {
  const requestWithCookies = request as RequestWithCookies;

  return requestWithCookies.cookies?.[ACCESS_TOKEN_COOKIE_NAME] ?? null;
}

//************************************************************** */

export async function authenticateRequest(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const accessToken = getAccessToken(request);

  if (!accessToken) {
    next(
      new AppError(401, "Authentication required.", {
        code: "AUTHENTICATION_REQUIRED",
      }),
    );

    return;
  }

  try {
    const tokenPayload = verifyAccessToken(accessToken);

    const validatedSession = await validateAccessSession(
      tokenPayload.sessionId,
      tokenPayload.sub,
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

    request.authenticatedMembership = null;

    if (tokenPayload.membershipId) {
      const membership = await findAuthenticatedMembership(
        tokenPayload.membershipId,
        user.id,
        tokenPayload.organizationId,
      );

      if (!membership) {
        next(
          new AppError(401, "Organization membership is unavailable.", {
            code: "ORGANIZATION_MEMBERSHIP_UNAVAILABLE",
          }),
        );

        return;
      }

      request.authenticatedMembership = {
        id: membership.id,
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        role: membership.role,
        status: membership.status,
      };
    }

    next();
  } catch {
    next(
      new AppError(401, "Access token is invalid or expired.", {
        code: "ACCESS_TOKEN_INVALID_OR_EXPIRED",
      }),
    );
  }
}

//************************************************************** */
