//************************************************************** 
// This uses separate admin cookie names, scoped to /api/v1/platform, with the existing secure, 
// HttpOnly, SameSite, domain, and token-lifetime settings.*/

import type { CookieOptions, Response } from "express";

import { env } from "../../config/env.js";

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MILLISECONDS,
} from "../auth/auth.constants.js";

//************************************************************** */

export const PLATFORM_ACCESS_TOKEN_COOKIE_NAME =
  "motodesk_admin_access_token";

export const PLATFORM_REFRESH_TOKEN_COOKIE_NAME =
  "motodesk_admin_refresh_token";

//************************************************************** */

const baseCookieOptions: CookieOptions = {
  httpOnly: true,

  secure: env.COOKIE_SECURE,

  sameSite: env.COOKIE_SAME_SITE,

  domain: env.COOKIE_DOMAIN,

  path: "/api/v1/platform",
};

const accessTokenCookieOptions: CookieOptions = {
  ...baseCookieOptions,

  maxAge: ACCESS_TOKEN_TTL_SECONDS * 1_000,
};

const refreshTokenCookieOptions: CookieOptions = {
  ...baseCookieOptions,

  maxAge: REFRESH_TOKEN_TTL_MILLISECONDS,
};

//************************************************************** */

export function setPlatformAuthenticationCookies(
  response: Response,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookie(
    PLATFORM_ACCESS_TOKEN_COOKIE_NAME,
    accessToken,
    accessTokenCookieOptions,
  );

  response.cookie(
    PLATFORM_REFRESH_TOKEN_COOKIE_NAME,
    refreshToken,
    refreshTokenCookieOptions,
  );
}

//************************************************************** */

export function clearPlatformAuthenticationCookies(
  response: Response,
): void {
  response.clearCookie(
    PLATFORM_ACCESS_TOKEN_COOKIE_NAME,
    baseCookieOptions,
  );

  response.clearCookie(
    PLATFORM_REFRESH_TOKEN_COOKIE_NAME,
    baseCookieOptions,
  );
}

//************************************************************** */