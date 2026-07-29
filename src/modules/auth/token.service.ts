// Access and one-time token generation

import jwt, {
  type JwtPayload,
  type SignOptions,
} from "jsonwebtoken";

import { env } from "../../config/env.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MILLISECONDS,
} from "./auth.constants.js";
import type {
  AccessTokenPayload,
  RefreshTokenParts,
} from "./auth.types.js";
import {
  buildRefreshToken,
  generateRandomToken,
  hashToken,
  splitRefreshToken,
} from "./auth.utils.js";

const accessTokenSignOptions: SignOptions = {
  algorithm: "HS256",
  expiresIn: ACCESS_TOKEN_TTL_SECONDS,
};

export interface GeneratedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface GeneratedRefreshToken {
  token: string;
  tokenHash: string;
  secret: string;
  expiresAt: Date;
}

export function generateAccessToken(
  payload: AccessTokenPayload,
): GeneratedAccessToken {
  const token = jwt.sign(
    payload,
    env.JWT_ACCESS_SECRET,
    accessTokenSignOptions,
  );

  const expiresAt = new Date(
    Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1_000,
  );

  return {
    token,
    expiresAt,
  };
}

export function verifyAccessToken(
  token: string,
): AccessTokenPayload {
  const decodedToken = jwt.verify(
    token,
    env.JWT_ACCESS_SECRET,
    {
      algorithms: ["HS256"],
    },
  );

  if (
    typeof decodedToken === "string" ||
    !isAccessTokenPayload(decodedToken)
  ) {
    throw new Error("Invalid access token payload.");
  }

  return decodedToken;
}

export function generateRefreshToken(
  sessionId: string,
): GeneratedRefreshToken {
  const secret = generateRandomToken();
  const token = buildRefreshToken(sessionId, secret);
  const tokenHash = hashToken(secret);

  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_MILLISECONDS,
  );

  return {
    token,
    tokenHash,
    secret,
    expiresAt,
  };
}

export function parseRefreshToken(
  token: string,
): RefreshTokenParts {
  return splitRefreshToken(token);
}

function isAccessTokenPayload(
  payload: JwtPayload,
): payload is JwtPayload & AccessTokenPayload {
  return (
    typeof payload.sub === "string" &&
    typeof payload.email === "string" &&
    typeof payload.sessionId === "string" &&
    isNullableString(payload.organizationId) &&
    isNullableString(payload.membershipId) &&
    isNullableString(payload.role)
  );
}

function isNullableString(
  value: unknown,
): value is string | null {
  return typeof value === "string" || value === null;
}