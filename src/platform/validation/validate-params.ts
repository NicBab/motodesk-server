import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

import { mapValidationErrors } from "./validate-response.js";

import type { ValidatedRequest } from "./validated-request.js";

//************************************************************** */

export function validateParams<T>(schema: ZodType<T>): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.params);

    if (!result.success) {
      response.status(400).json({
        success: false,
        message: "Route parameter validation failed.",
        errors: mapValidationErrors(result.error),
      });

      return;
    }

    (request as ValidatedRequest<unknown, T>).validatedParams = result.data;

    next();
  };
}
