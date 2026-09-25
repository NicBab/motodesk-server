import type { NextFunction, Request, Response } from "express";

import { logger } from "../../../config/logger.js";

import { AppError } from "../../errors/app-error.js";

import { HttpStatus } from "../../http/http-status.js";

import {
  InMemoryRateLimitStore,
  type RateLimitStore,
} from "./rate-limit.store.js";

//************************************************************** */

export interface RateLimitOptions {
  name: string;

  limit: number;

  windowMilliseconds: number;

  store?: RateLimitStore;

  keyGenerator?: (request: Request) => string;
}

//************************************************************** */

const defaultStore = new InMemoryRateLimitStore();

//************************************************************** */

function getDefaultRateLimitKey(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? "unknown";
}

//************************************************************** */

function getRetryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1_000));
}

//************************************************************** */

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const store = options.store ?? defaultStore;

  return function rateLimitMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const identifier = options.keyGenerator
      ? options.keyGenerator(request)
      : getDefaultRateLimitKey(request);

    const key = `${options.name}:${identifier}`;

    const record = store.increment(key, options.windowMilliseconds);

    const remaining = Math.max(0, options.limit - record.count);

    response.setHeader("RateLimit-Limit", String(options.limit));

    response.setHeader("RateLimit-Remaining", String(remaining));

    response.setHeader(
      "RateLimit-Reset",
      String(Math.ceil(record.resetAt / 1_000)),
    );

    if (record.count <= options.limit) {
      next();

      return;
    }

    const retryAfterSeconds = getRetryAfterSeconds(record.resetAt);

    response.setHeader("Retry-After", String(retryAfterSeconds));

    logger.warn("Rate limit exceeded", {
      policy: options.name,

      method: request.method,

      path: request.originalUrl,

      ipAddress: getDefaultRateLimitKey(request),

      limit: options.limit,

      windowMilliseconds: options.windowMilliseconds,

      retryAfterSeconds,
    });

    next(
      new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        "Too many requests. Please try again later.",
        {
          code: "RATE_LIMIT_EXCEEDED",

          details: {
            retryAfterSeconds,
          },
        },
      ),
    );
  };
}

//************************************************************** */
