import type {
  Request,
  Response,
} from "express";

import {
  createGoogleAuthorizationRequest,
} from "./google-oauth.service.js";

import {
  storeGoogleOAuthState,
} from "./oauth-state.service.js";

//************************************************************** */

export async function startGoogleOAuth(
  _request: Request,
  response: Response,
): Promise<void> {
  const authorizationRequest =
    await createGoogleAuthorizationRequest();

  storeGoogleOAuthState(
    response,
    authorizationRequest.state,
  );

  response.redirect(
    authorizationRequest.url.toString(),
  );
}

//************************************************************** */