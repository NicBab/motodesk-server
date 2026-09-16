import type { Request, Response } from "express";

import { env } from "../../../config/env.js";

import { AppError } from "../../../platform/errors/app-error.js";

import { getRequestMetadata } from "../../../platform/request/request.metadata.js";

import { setAuthenticationCookies } from "../http/cookie.service.js";

import {
  clearGoogleOAuthState,
  readGoogleOAuthState,
} from "./oauth-state.service.js";

import { completeGoogleOAuth } from "./google-oauth-callback.service.js";

//************************************************************** */

export async function googleOAuthCallback(
  request: Request,
  response: Response,
): Promise<void> {
  const oauthState = readGoogleOAuthState(request);

  if (!oauthState) {
    clearGoogleOAuthState(response);

    throw new AppError(
      401,
      "Google authentication session is invalid or has expired.",
      {
        code: "GOOGLE_OAUTH_STATE_INVALID",
      },
    );
  }

  //************************************************************** */
  // Reconstruct the exact callback URL received by MotoDesk.
  //
  // openid-client validates the authorization response using this
  // URL together with the state, nonce, and PKCE verifier that were
  // generated before redirecting the browser to Google.

  const callbackUrl = new URL(
    request.originalUrl,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  );

  try {
    const result = await completeGoogleOAuth(
      callbackUrl,
      oauthState,
      getRequestMetadata(request),
    );

    setAuthenticationCookies(response, result.accessToken, result.refreshToken);

    clearGoogleOAuthState(response);

    //************************************************************** */
    // Existing users with an active organization membership can
    // continue directly into MotoDesk.
    //
    // New external-auth users have no membership yet and must
    // complete organization onboarding first.

    const redirectPath =
      result.membership !== null ? "/dashboard" : "/onboarding";

    response.redirect(`${env.CLIENT_URL}${redirectPath}`);
  } catch (error) {
    clearGoogleOAuthState(response);

    throw error;
  }
}
