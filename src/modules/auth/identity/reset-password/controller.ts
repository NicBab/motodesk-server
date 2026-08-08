import type {
  Request,
  Response,
} from "express";

import { ok } from "../../../../platform/http/api-response.js";
import {
  requireValidatedBody,
} from "../../../../platform/validation/validated-request.js";

import type {
  RequestContext,
} from "../../auth.types.js";

import type {
  ResetPasswordInput,
} from "./schema.js";

import {
  resetPassword,
} from "./service.js";

//************************************************************** */

function getRequestContext(
  request: Request,
): RequestContext {
  return {
    ipAddress:
      request.ip ?? null,
    userAgent:
      request.get("user-agent") ?? null,
  };
}

//************************************************************** */

export async function resetPasswordHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const input =
    requireValidatedBody<ResetPasswordInput>(
      request,
    );

  await resetPassword(
    input,
    getRequestContext(request),
  );

  ok(response, {
    message:
      "Password reset successfully.",
  });
}