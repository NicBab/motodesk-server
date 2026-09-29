import type { NextFunction, Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type { AuthenticatedRequest } from "./auth.middleware.js";

import { assertRecentAuthentication } from "./sessions/session.service.js";

//************************************************************** */

export async function requireRecentAuthentication(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  const sessionId = request.authenticationSessionId;

  if (!userId || !sessionId) {
    next(
      new AppError(401, "Authentication required.", {
        code: "AUTHENTICATION_REQUIRED",
      }),
    );

    return;
  }

  try {
    await assertRecentAuthentication(sessionId);

    next();
  } catch (error) {
    next(error);
  }
}

//************************************************************** */
