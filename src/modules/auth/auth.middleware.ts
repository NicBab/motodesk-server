import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/prisma.js";

import { ACCESS_TOKEN_COOKIE_NAME } from "./auth.constants.js";

import type {
  AuthenticatedMembership,
  AuthenticatedUser,
} from "./auth.types.js";

import { validateAccessSession } from "./session.service.js";
import { verifyAccessToken } from "./token.service.js";

//**************************************************************************************

export interface AuthenticatedRequest extends Request {
  authenticatedUser?: AuthenticatedUser;
  authenticatedMembership?: AuthenticatedMembership | null;
  authenticationSessionId?: string;
}

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

//**************************************************************************************

function getAccessToken(request: Request): string | null {
  const requestWithCookies = request as RequestWithCookies;

  return requestWithCookies.cookies?.[ACCESS_TOKEN_COOKIE_NAME] ?? null;
}

//**************************************************************************************

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

    const user = await prisma.user.findUnique({
      where: {
        id: tokenPayload.sub,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

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
      const membership = await prisma.membership.findFirst({
        where: {
          id: tokenPayload.membershipId,
          userId: user.id,
          ...(tokenPayload.organizationId
            ? {
                organizationId: tokenPayload.organizationId,
              }
            : {}),
        },
        select: {
          id: true,
          organizationId: true,
          role: true,
          status: true,
          organization: {
            select: {
              name: true,
            },
          },
        },
      });

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

//**************************************************************************************
