//************************************************************** 
// Login and refresh return the existing authentication response shape without exposing tokens. 
// Logout clears only admin cookies, including when the credential is missing or invalid.*/

import type { Request, Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import { ok } from "../../platform/http/api-response.js";

import {
  getRequestMetadata,
} from "../../platform/request/request.metadata.js";

import {
  requireValidatedBody,
} from "../../platform/validation/validated-request.js";

import type {
  LoginInput,
} from "../auth/authentication/login/schema.js";

import {
  PLATFORM_REFRESH_TOKEN_COOKIE_NAME,
  clearPlatformAuthenticationCookies,
  setPlatformAuthenticationCookies,
} from "./platform-auth.cookies.js";

import {
  loginPlatformAdmin,
  logoutPlatformAdmin,
  refreshPlatformSession,
} from "./platform-auth.service.js";

//************************************************************** */

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

function getPlatformRefreshToken(
  request: Request,
): string | null {
  const value = (request as RequestWithCookies).cookies?.[
    PLATFORM_REFRESH_TOKEN_COOKIE_NAME
  ];

  return typeof value === "string" && value.length > 0
    ? value
    : null;
}

//************************************************************** */

export async function loginPlatformAdminHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const input = requireValidatedBody<LoginInput>(request);

  const result = await loginPlatformAdmin(
    input,
    getRequestMetadata(request),
  );

  setPlatformAuthenticationCookies(
    response,
    result.accessToken,
    result.refreshToken,
  );

  ok(response, {
    user: result.user,
    membership: result.membership,
    permissions: [],
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}

//************************************************************** */

export async function refreshPlatformSessionHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const refreshToken = getPlatformRefreshToken(request);

  if (!refreshToken) {
    throw new AppError(401, "Refresh session is unavailable.", {
      code: "REFRESH_TOKEN_REQUIRED",
    });
  }

  const result = await refreshPlatformSession(
    refreshToken,
    getRequestMetadata(request),
  );

  setPlatformAuthenticationCookies(
    response,
    result.accessToken,
    result.refreshToken,
  );

  ok(response, {
    user: result.user,
    membership: result.membership,
    permissions: [],
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}

//************************************************************** */

export async function logoutPlatformAdminHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const refreshToken = getPlatformRefreshToken(request);

  try {
    if (!refreshToken) {
      throw new AppError(401, "Authentication required.", {
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    await logoutPlatformAdmin(
      refreshToken,
      getRequestMetadata(request),
    );
  } finally {
    clearPlatformAuthenticationCookies(response);
  }

  ok(response, {
    message: "Logged out successfully.",
  });
}

//************************************************************** */