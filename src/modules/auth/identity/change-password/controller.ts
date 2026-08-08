import type { Request, Response } from "express";

import { AppError } from "../../../../platform/errors/app-error.js";
import { ok } from "../../../../platform/http/api-response.js";
import { requireValidatedBody } from "../../../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../../auth.middleware.js";
import type { RequestContext } from "../../auth.types.js";

import type { ChangePasswordInput } from "./schema.js";

import {
  changePassword,
} from "./service.js";

//************************************************************** */

function getRequestContext(request: Request): RequestContext {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.get("user-agent") ?? null,
  };
}

//************************************************************** */

export async function changePasswordHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  const sessionId = request.authenticationSessionId;

  if (!userId || !sessionId) {
    throw new AppError(401, "Authentication required.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const input = requireValidatedBody<ChangePasswordInput>(request);

  const result = await changePassword(
    userId,
    sessionId,
    input,
    getRequestContext(request),
  );

  ok(response, {
    message: "Password changed successfully.",
    revokedSessionCount: result.revokedSessionCount,
  });
}
