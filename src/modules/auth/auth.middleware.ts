import type { NextFunction, Request, Response } from "express";
// import { prisma } from "../../config/prisma.js";
import { ACCESS_TOKEN_COOKIE_NAME } from "./auth.constants.js";
import { validateAccessSession } from "./session.service.js";
import { verifyAccessToken } from "./token.service.js";

import type {
  AuthenticatedMembership,
  AuthenticatedUser,
} from "./auth.types.js";

import {
  findAuthenticatedMembership,
  findAuthenticatedUserById,
} from "./auth.repository.js";

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
  response: Response,
  next: NextFunction,
): Promise<void> {
  const accessToken = getAccessToken(request);

  if (!accessToken) {
    response.status(401).json({
      message: "Authentication required.",
    });

    return;
  }

  try {
    const tokenPayload = verifyAccessToken(accessToken);

    const validatedSession = await validateAccessSession(
      tokenPayload.sessionId,
      tokenPayload.sub,
    );

    if (!validatedSession) {
      response.status(401).json({
        message: "Session is invalid or expired.",
      });

      return;
    }

const user =
  await findAuthenticatedUserById(
    tokenPayload.sub,
  );

    if (!user || !user.isActive) {
      response.status(401).json({
        message: "Account is unavailable.",
      });

      return;
    }

    request.authenticatedUser = user;
    request.authenticationSessionId = validatedSession.session.id;

    request.authenticatedMembership = null;

    if (tokenPayload.membershipId) {
const membership =
  await findAuthenticatedMembership(
    tokenPayload.membershipId,
    user.id,
    tokenPayload.organizationId,
  );

      if (!membership) {
        response.status(401).json({
          message: "Organization membership is unavailable.",
        });

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
    response.status(401).json({
      message: "Access token is invalid or expired.",
    });
  }
}

//************************************************************** */
