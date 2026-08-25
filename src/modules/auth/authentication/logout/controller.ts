import type { Request, Response } from "express";

import { ok } from "../../../../platform/http/api-response.js";

import { AppError } from "../../../../platform/errors/app-error.js";

import {
  REFRESH_TOKEN_COOKIE_NAME,
} from "../../auth.constants.js";

import { logoutUser } from "./service.js";

import {
  clearAuthenticationCookies,
} from "../../http/cookie.service.js";

//************************************************************** */

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

//************************************************************** */

export async function logout(
  request: Request,
  response: Response,
): Promise<void> {
  const requestWithCookies = request as RequestWithCookies;

  const refreshToken =
    requestWithCookies.cookies?.[
      REFRESH_TOKEN_COOKIE_NAME
    ];

  if (!refreshToken) {
    clearAuthenticationCookies(response);

    throw new AppError(401, "Authentication required.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  await logoutUser(refreshToken);

  clearAuthenticationCookies(response);

  ok(response, {
    message: "Logged out successfully.",
  });
}

//************************************************************** */