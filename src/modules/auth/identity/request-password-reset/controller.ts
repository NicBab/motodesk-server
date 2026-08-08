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
  RequestPasswordResetInput,
} from "./schema.js";

import {
  requestPasswordReset,
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

export async function requestPasswordResetHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const input =
    requireValidatedBody<RequestPasswordResetInput>(
      request,
    );

  const result =
    await requestPasswordReset(
      input,
      getRequestContext(request),
    );

  ok(response, result);
}