import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { ZodType } from "zod";

export function validateRequest<T>(
  schema: ZodType<T>,
): RequestHandler {
  return (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      response.status(400).json({
        success: false,
        message: "Request validation failed.",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });

      return;
    }

    request.body = result.data;

    next();
  };
}