import type {
  Request,
  Response,
} from "express";

import { prisma } from "../../../../config/prisma.js";

import {
  ok,
} from "../../../../platform/http/api-response.js";

import {
  AppError,
} from "../../../../platform/errors/app-error.js";

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

import {
  REFRESH_TOKEN_COOKIE_NAME,
} from "../../auth.constants.js";

import {
  logoutUser,
} from "./service.js";

import {
  clearAuthenticationCookies,
} from "../../http/cookie.service.js";

//************************************************************** */

type RequestWithCookies =
  Request & {
    cookies?: Record<
      string,
      string | undefined
    >;
  };

//************************************************************** */

export async function logout(
  request: Request,
  response: Response,
): Promise<void> {
  const requestWithCookies =
    request as RequestWithCookies;

  const refreshToken =
    requestWithCookies.cookies?.[
      REFRESH_TOKEN_COOKIE_NAME
    ];

  if (
    !refreshToken
  ) {
    clearAuthenticationCookies(
      response,
    );

    throw new AppError(
      401,
      "Authentication required.",
      {
        code:
          "AUTHENTICATION_REQUIRED",
      },
    );
  }

  //************************************************************** */

  const logoutResult =
    await logoutUser(
      refreshToken,
    );

  //************************************************************** */
  // Logout intentionally does not require a valid access token.
  //
  // Attribute the event from the session represented by the refresh
  // credential rather than request.authenticatedUser.

  if (
    logoutResult.userId
  ) {
    const membership =
      await prisma.membership.findFirst({
        where: {
          userId:
            logoutResult.userId,

          status:
            "ACTIVE",
        },

        select: {
          organizationId:
            true,
        },

        orderBy: {
          createdAt:
            "asc",
        },
      });

    const context =
      getRequestMetadata(
        request,
      );

    await createAuditLog({
      action:
        AUDIT_ACTIONS.AUTH_LOGOUT,

      entityType:
        AUDIT_ENTITY_TYPES.SESSION,

      entityId:
        logoutResult.sessionId,

      actor: {
        userId:
          logoutResult.userId,

        sessionId:
          logoutResult.sessionId,

        ...(membership
          ? {
              organizationId:
                membership.organizationId,
            }
          : {}),
      },

      context: {
        ...(context.ipAddress !== null
          ? {
              ipAddress:
                context.ipAddress,
            }
          : {}),

        ...(context.userAgent !== null
          ? {
              userAgent:
                context.userAgent,
            }
          : {}),
      },

      metadata: {
        scope:
          "CURRENT_SESSION",
      },
    });
  }

  //************************************************************** */

  clearAuthenticationCookies(
    response,
  );

  ok(
    response,
    {
      message:
        "Logged out successfully.",
    },
  );
}

//************************************************************** */