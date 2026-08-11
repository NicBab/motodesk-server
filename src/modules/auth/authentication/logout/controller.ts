import type { Request, Response } from "express";

import { ok } from "../../../../platform/http/api-response.js";

import { requireValidatedBody } from "../../../../platform/validation/validated-request.js";

import type { LogoutInput } from "./schema.js";

import { logoutUser } from "./service.js";

import { clearAuthenticationCookies } from "../../cookie.service.js";

//************************************************************** */

export async function logout(
  request: Request,
  response: Response,
): Promise<void> {
  const input = requireValidatedBody<LogoutInput>(request);

  await logoutUser(input);

  clearAuthenticationCookies(response);

  ok(response, {
    message: "Logged out successfully.",
  });
}

//************************************************************** */
