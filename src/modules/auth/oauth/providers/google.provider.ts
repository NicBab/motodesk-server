// src/modules/auth/oauth/providers/google.provider.ts

import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from "openid-client";

import { env } from "../../../../config/env.js";

//************************************************************** */

const GOOGLE_ISSUER = new URL("https://accounts.google.com");

const GOOGLE_SCOPES = ["openid", "email", "profile"];

//************************************************************** */

export interface GoogleAuthorizationRequest {
  authorizationUrl: URL;

  state: string;

  nonce: string;

  codeVerifier: string;
}

//************************************************************** */

export interface GoogleIdentity {
  providerAccountId: string;

  email: string;

  emailVerified: boolean;

  firstName: string | null;

  lastName: string | null;
}

//************************************************************** */

function requireGoogleConfiguration(): {
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

async function getGoogleConfiguration(): Promise<Configuration> {
  const { clientId, clientSecret } = requireGoogleConfiguration();

  return discovery(GOOGLE_ISSUER, clientId, clientSecret);
}

//************************************************************** */

export async function createGoogleAuthorizationRequest(): Promise<GoogleAuthorizationRequest> {
  const configuration = await getGoogleConfiguration();

  const { redirectUri } = requireGoogleConfiguration();

  const state = randomState();

  const nonce = randomNonce();

  const codeVerifier = randomPKCECodeVerifier();

  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

  const authorizationUrl = buildAuthorizationUrl(configuration, {
    redirect_uri: redirectUri,

    scope: GOOGLE_SCOPES.join(" "),

    state,

    nonce,

    code_challenge: codeChallenge,

    code_challenge_method: "S256",

    prompt: "select_account",
  });

  return {
    authorizationUrl,
    state,
    nonce,
    codeVerifier,
  };
}

//************************************************************** */

export async function exchangeGoogleAuthorizationCode(
  callbackUrl: URL,
  expectedState: string,
  expectedNonce: string,
  codeVerifier: string,
): Promise<GoogleIdentity> {
  const configuration = await getGoogleConfiguration();

  const tokenResponse = await authorizationCodeGrant(
    configuration,
    callbackUrl,
    {
      expectedState,
      expectedNonce,
      pkceCodeVerifier: codeVerifier,
    },
  );

  const claims = tokenResponse.claims();

  if (!claims) {
    throw new Error("Google did not return identity claims.");
  }

  const providerAccountId = claims.sub;

  const email = claims.email;

  if (typeof providerAccountId !== "string" || providerAccountId.length === 0) {
    throw new Error("Google did not return a valid account identifier.");
  }

  if (typeof email !== "string" || email.length === 0) {
    throw new Error("Google did not return an email address.");
  }

  const firstName =
    typeof claims.given_name === "string" ? claims.given_name : null;

  const lastName =
    typeof claims.family_name === "string" ? claims.family_name : null;

  return {
    providerAccountId,

    email: email.trim().toLowerCase(),

    emailVerified: claims.email_verified === true,

    firstName,

    lastName,
  };
}

//************************************************************** */
