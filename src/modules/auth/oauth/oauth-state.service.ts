import { createHash, randomBytes } from "node:crypto";

import type { CookieOptions, Request, Response } from "express";

import { env } from "../../../config/env.js";

//************************************************************** */

const GOOGLE_OAUTH_STATE_COOKIE_NAME = "motodesk_google_oauth_state";

const OAUTH_STATE_TTL_MILLISECONDS = 10 * 60 * 1_000;

//************************************************************** */

interface StoredGoogleOAuthState {
  state: string;

  nonce: string;

  codeVerifier: string;

  expiresAt: number;

  signature: string;
}

//************************************************************** */

export interface GoogleOAuthState {
  state: string;

  nonce: string;

  codeVerifier: string;
}

//************************************************************** */

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

//************************************************************** */

const oauthCookieOptions: CookieOptions = {
  httpOnly: true,

  secure: env.COOKIE_SECURE,

  sameSite: env.COOKIE_SAME_SITE,

  domain: env.COOKIE_DOMAIN,

  path: "/api/v1/auth/oauth/google",

  maxAge: OAUTH_STATE_TTL_MILLISECONDS,
};

//************************************************************** */

const expiredOAuthCookieOptions: CookieOptions = {
  ...oauthCookieOptions,

  expires: new Date(0),

  maxAge: 0,
};

//************************************************************** */

function createSignature(
  state: string,
  nonce: string,
  codeVerifier: string,
  expiresAt: number,
): string {
  return createHash("sha256")
    .update(
      [
        state,
        nonce,
        codeVerifier,
        expiresAt.toString(),
        env.JWT_ACCESS_SECRET,
      ].join(":"),
    )
    .digest("hex");
}

//************************************************************** */

function encodeState(value: StoredGoogleOAuthState): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

//************************************************************** */

function decodeState(value: string): StoredGoogleOAuthState | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;

    if (typeof decoded !== "object" || decoded === null) {
      return null;
    }

    const candidate = decoded as Partial<StoredGoogleOAuthState>;

    if (
      typeof candidate.state !== "string" ||
      typeof candidate.nonce !== "string" ||
      typeof candidate.codeVerifier !== "string" ||
      typeof candidate.expiresAt !== "number" ||
      typeof candidate.signature !== "string"
    ) {
      return null;
    }

    return {
      state: candidate.state,

      nonce: candidate.nonce,

      codeVerifier: candidate.codeVerifier,

      expiresAt: candidate.expiresAt,

      signature: candidate.signature,
    };
  } catch {
    return null;
  }
}

//************************************************************** */

export function storeGoogleOAuthState(
  response: Response,
  input: GoogleOAuthState,
): void {
  const expiresAt = Date.now() + OAUTH_STATE_TTL_MILLISECONDS;

  const signature = createSignature(
    input.state,
    input.nonce,
    input.codeVerifier,
    expiresAt,
  );

  const value = encodeState({
    state: input.state,

    nonce: input.nonce,

    codeVerifier: input.codeVerifier,

    expiresAt,

    signature,
  });

  response.cookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, value, oauthCookieOptions);
}

//************************************************************** */

export function readGoogleOAuthState(
  request: Request,
): GoogleOAuthState | null {
  const requestWithCookies = request as RequestWithCookies;

  const value = requestWithCookies.cookies?.[GOOGLE_OAUTH_STATE_COOKIE_NAME];

  if (!value) {
    return null;
  }

  const stored = decodeState(value);

  if (!stored) {
    return null;
  }

  if (stored.expiresAt <= Date.now()) {
    return null;
  }

  const expectedSignature = createSignature(
    stored.state,
    stored.nonce,
    stored.codeVerifier,
    stored.expiresAt,
  );

  if (stored.signature !== expectedSignature) {
    return null;
  }

  return {
    state: stored.state,

    nonce: stored.nonce,

    codeVerifier: stored.codeVerifier,
  };
}

//************************************************************** */

export function clearGoogleOAuthState(response: Response): void {
  response.clearCookie(
    GOOGLE_OAUTH_STATE_COOKIE_NAME,
    expiredOAuthCookieOptions,
  );
}

//************************************************************** */

export function createOAuthFailureId(): string {
  return randomBytes(12).toString("hex");
}

//************************************************************** */
