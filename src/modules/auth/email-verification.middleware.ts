import type {
  NextFunction,
  Response,
} from "express";

import {
  AppError,
} from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "./auth.middleware.js";

//************************************************************** */

export function requireVerifiedEmail(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): void {
  const user =
    request.authenticatedUser;

  //************************************************************** */
  // Authentication must run before this middleware.

  if (!user) {
    next(
      new AppError(
        401,
        "Authentication required.",
        {
          code:
            "AUTHENTICATION_REQUIRED",
        },
      ),
    );

    return;
  }

  //************************************************************** */

  if (!user.emailVerifiedAt) {
    next(
      new AppError(
        403,
        "Verify your email address to continue.",
        {
          code:
            "EMAIL_VERIFICATION_REQUIRED",
        },
      ),
    );

    return;
  }

  next();
}

//************************************************************** */