import type {
  Request,
  Response,
} from "express";

import { ok } from "../../../../platform/http/api-response.js";
import {
  requireValidatedBody,
} from "../../../../platform/validation/validated-request.js";

import type {
  ResendEmailVerificationInput,
} from "./schema.js";

import {
  resendEmailVerification,
} from "./service.js";

//************************************************************** */

export async function resendEmailVerificationHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const input =
    requireValidatedBody<ResendEmailVerificationInput>(
      request,
    );

  const result =
    await resendEmailVerification(
      input,
    );

  ok(response, result);
}