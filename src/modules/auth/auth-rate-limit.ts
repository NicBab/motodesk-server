import type {
  Request,
} from "express";

import {
  createRateLimitMiddleware,
} from "../../platform/security/rate-limit/rate-limit.middleware.js";

//************************************************************** */

const MINUTE =
  60 * 1_000;

const HOUR =
  60 * MINUTE;

//************************************************************** */

function normalizeEmail(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

//************************************************************** */

function getRequestIp(
  request: Request,
): string {
  return (
    request.ip ??
    request.socket.remoteAddress ??
    "unknown"
  );
}

//************************************************************** */

function createIpEmailKey(
  request: Request,
): string {
  const ip =
    getRequestIp(
      request,
    );

  const email =
    normalizeEmail(
      request.body?.email,
    );

  return email
    ? `${ip}:${email}`
    : ip;
}

//************************************************************** */

export const loginRateLimit =
  createRateLimitMiddleware({
    name:
      "auth-login",

    limit:
      10,

    windowMilliseconds:
      15 * MINUTE,

    keyGenerator:
      createIpEmailKey,
  });

//************************************************************** */

export const registrationRateLimit =
  createRateLimitMiddleware({
    name:
      "auth-register",

    limit:
      5,

    windowMilliseconds:
      HOUR,
  });

//************************************************************** */

export const passwordResetRequestRateLimit =
  createRateLimitMiddleware({
    name:
      "auth-password-reset-request",

    limit:
      5,

    windowMilliseconds:
      HOUR,

    keyGenerator:
      createIpEmailKey,
  });

//************************************************************** */

export const passwordResetRateLimit =
  createRateLimitMiddleware({
    name:
      "auth-password-reset",

    limit:
      10,

    windowMilliseconds:
      15 * MINUTE,
  });

//************************************************************** */

export const emailVerificationRateLimit =
  createRateLimitMiddleware({
    name:
      "auth-email-verification",

    limit:
      10,

    windowMilliseconds:
      15 * MINUTE,

    keyGenerator:
      createIpEmailKey,
  });

//************************************************************** */

export const emailVerificationResendRateLimit =
  createRateLimitMiddleware({
    name:
      "auth-email-verification-resend",

    limit:
      5,

    windowMilliseconds:
      HOUR,

    keyGenerator:
      createIpEmailKey,
  });

//************************************************************** */

export const refreshRateLimit =
  createRateLimitMiddleware({
    name:
      "auth-refresh",

    limit:
      60,

    windowMilliseconds:
      15 * MINUTE,
  });

//************************************************************** */