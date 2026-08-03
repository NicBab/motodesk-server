import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { ZodType } from "zod";

import { mapValidationErrors } from "./validate-response.js";

//************************************************************** */

export function validateQuery<T>(
  schema: ZodType<T>,
): RequestHandler {
  return (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    const result =
      schema.safeParse(request.query);

    if (!result.success) {
      response.status(400).json({
        success: false,
        message:
          "Query parameter validation failed.",
        errors: mapValidationErrors(
          result.error,
        ),
      });

      return;
    }

    request.query =
      result.data as Request["query"];

    next();
  };
}