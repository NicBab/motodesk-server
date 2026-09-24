import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  env,
} from "../config/env.js";

import {
  AppError,
} from "../platform/errors/app-error.js";

//************************************************************** */

const SAFE_METHODS =
  new Set([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

//************************************************************** */

function getOriginFromReferer(
  referer: string,
): string | null {
  try {
    return new URL(
      referer,
    ).origin;
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
  if (
    SAFE_METHODS.has(
      request.method,
    )
  ) {
    next();

    return;
  }

  const origin =
    request.get(
      "origin",
    );

  const referer =
    request.get(
      "referer",
    );

  //************************************************************** */
  // Browser mutation requests should contain Origin. Referer is
  // retained as a fallback for compatible clients.

  const requestOrigin =
    origin ??
    (
      referer
        ? getOriginFromReferer(
            referer,
          )
        : null
    );

  //************************************************************** */
  // Requests without browser-origin metadata are allowed here.
  // This preserves integration tests, CLI/API clients and trusted
  // server-to-server consumers. Authentication and authorization
  // still apply normally to protected endpoints.

  if (!requestOrigin) {
    next();

    return;
  }

  if (
    requestOrigin ===
    env.CLIENT_URL
  ) {
    next();

    return;
  }

  next(
    new AppError(
      403,
      "Request origin is not allowed.",
      {
        code:
          "REQUEST_ORIGIN_NOT_ALLOWED",
      },
    ),
  );
}

//************************************************************** */