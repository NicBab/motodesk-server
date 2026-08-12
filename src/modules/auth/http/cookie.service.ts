import type { CookieOptions, Response } from "express";
import { env } from "../../../config/env.js";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_TTL_MILLISECONDS,
} from "../auth.constants.js";

//************************************************************** */

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  domain: env.COOKIE_DOMAIN,
  path: "/",
};

const accessTokenCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: ACCESS_TOKEN_TTL_SECONDS * 1_000,
};

const refreshTokenCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: REFRESH_TOKEN_TTL_MILLISECONDS,
};

const expiredCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  expires: new Date(0),
  maxAge: 0,
};

//************************************************************** */

export function setAccessTokenCookie(
  response: Response,
  accessToken: string,
): void {
  response.cookie(
    ACCESS_TOKEN_COOKIE_NAME,
    accessToken,
    accessTokenCookieOptions,
  );
}

//************************************************************** */
export function setAuthenticationCookies(
  response: Response,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookie(
    ACCESS_TOKEN_COOKIE_NAME,
    accessToken,
    accessTokenCookieOptions,
  );

  response.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    refreshToken,
    refreshTokenCookieOptions,
  );
}

//************************************************************** */

export function clearAuthenticationCookies(response: Response): void {
  response.clearCookie(ACCESS_TOKEN_COOKIE_NAME, expiredCookieOptions);

  response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, expiredCookieOptions);
}

//************************************************************** */
