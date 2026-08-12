import type { Request, Response } from "express";

import { ok } from "../../../../platform/http/api-response.js";

import { requireValidatedBody } from "../../../../platform/validation/validated-request.js";

import { getRequestMetadata } from "../../../../platform/request/request.metadata.js";

import type { RequestPasswordResetInput } from "./schema.js";

import { requestPasswordReset } from "./service.js";

//************************************************************** */

export async function requestPasswordResetHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const input = requireValidatedBody<RequestPasswordResetInput>(request);

  const result = await requestPasswordReset(input, getRequestMetadata(request));

  ok(response, result);
}

//************************************************************** */
