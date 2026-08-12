import type { Request, Response } from "express";

import { ok } from "../../../../platform/http/api-response.js";

import { requireValidatedBody } from "../../../../platform/validation/validated-request.js";

import { getRequestMetadata } from "../../../../platform/request/request.metadata.js";

import type { ResetPasswordInput } from "./schema.js";

import { resetPassword } from "./service.js";

//************************************************************** */

export async function resetPasswordHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const input = requireValidatedBody<ResetPasswordInput>(request);

  await resetPassword(input, getRequestMetadata(request));

  ok(response, {
    message: "Password reset successfully.",
  });
}

//************************************************************** */
