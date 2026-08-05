import type { Response } from "express";

import { AppError } from "../../../../platform/errors/app-error.js";
import { ok } from "../../../../platform/http/api-response.js";
import { requireValidatedBody } from "../../../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../../auth.middleware.js";
import type { UpdateProfileInput } from "../../auth.schemas.js";
import { updateProfile } from "./service.js";

//************************************************************** */

export async function updateProfileHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  if (!userId) {
    throw new AppError(401, "Authentication required.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const input = requireValidatedBody<UpdateProfileInput>(request);

  const user = await updateProfile(userId, input);

  ok(response, {
    message: "Profile updated successfully.",
    user,
  });
}
