import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  isAllowedBrowserOrigin,
} from "../config/browser-origins.js";

import {
  AppError,
} from "../platform/errors/app-error.js";

//************************************************************** */

const SAFE_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

//************************************************************** */

function getOriginFromReferer(
  referer: string,
): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

//************************************************************** */

export function verifyRequestOrigin(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(request.method)) {
    next();
    return;
  }

  const origin = request.get("origin");
  const referer = request.get("referer");

  // Prefer Origin. Retain Referer as a browser compatibility fallback.
  const requestOrigin =
    origin ??
    (referer ? getOriginFromReferer(referer) : null);

  // Preserve requests without browser-origin metadata.
  // Authentication and authorization still apply to protected routes.
  if (origin === undefined && referer === undefined) {
    next();
    return;
  }

  if (
    requestOrigin !== null &&
    requestOrigin !== undefined &&
    isAllowedBrowserOrigin(requestOrigin)
  ) {
    next();
    return;
  }

  next(
    new AppError(
      403,
      "Request origin is not allowed.",
      {
        code: "REQUEST_ORIGIN_NOT_ALLOWED",
      },
    ),
  );
}

//************************************************************** */