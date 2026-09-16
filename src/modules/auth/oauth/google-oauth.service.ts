import {
  Configuration,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";

import { env } from "../../../config/env.js";

import type { GoogleOAuthState } from "./oauth-state.service.js";

//************************************************************** */

const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const GOOGLE_JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";

const GOOGLE_ISSUER = "https://accounts.google.com";

//************************************************************** */

export interface GoogleAuthorizationRequest {
  url: URL;

  state: GoogleOAuthState;
}

//************************************************************** */

function requireGoogleOAuthConfiguration(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;

  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;

  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

//************************************************************** */

export function createGoogleOAuthConfiguration(): Configuration {
  const { clientId, clientSecret } = requireGoogleOAuthConfiguration();

  return new Configuration(
    {
      issuer: GOOGLE_ISSUER,

      authorization_endpoint: GOOGLE_AUTHORIZATION_ENDPOINT,

      token_endpoint: GOOGLE_TOKEN_ENDPOINT,

      jwks_uri: GOOGLE_JWKS_ENDPOINT,
    },

    clientId,

    {
      client_secret: clientSecret,

      redirect_uris: [env.GOOGLE_OAUTH_REDIRECT_URI!],

      response_types: ["code"],
    },
  );
}

//************************************************************** */

export async function createGoogleAuthorizationRequest(): Promise<GoogleAuthorizationRequest> {
  const { redirectUri } = requireGoogleOAuthConfiguration();

  const configuration = createGoogleOAuthConfiguration();

  const state = randomState();

  const nonce = randomNonce();

  const codeVerifier = randomPKCECodeVerifier();

  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

  const url = buildAuthorizationUrl(configuration, {
    redirect_uri: redirectUri,

    scope: "openid email profile",

    response_type: "code",

    state,

    nonce,

    code_challenge: codeChallenge,

    code_challenge_method: "S256",

    prompt: "select_account",
  });

  return {
    url,

    state: {
      state,
      nonce,
      codeVerifier,
    },
  };
}

//************************************************************** */
