import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { ZodType } from "zod";

import type {
  ValidatedRequest,
} from "./validated-request.js";
import { mapValidationErrors } from "./validate-response.js";

//************************************************************** */

export function validateBody<T>(
  schema: ZodType<T>,
): RequestHandler {
  return (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    const result =
      schema.safeParse(request.body);

    if (!result.success) {
      response.status(400).json({
        success: false,
        message:
          "Request body validation failed.",
        errors: mapValidationErrors(
          result.error,
        ),
      });

      return;
    }

    (
      request as ValidatedRequest<T>
    ).validatedBody = result.data;

    next();
  };
}