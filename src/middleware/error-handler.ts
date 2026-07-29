import type { ErrorRequestHandler } from "express";
import { AppError } from "../common/errors/app-error.js";
import { env } from "../config/env.js";

type ErrorWithStatus = Error & {
  status?: number;
  statusCode?: number;
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
): void => {
  const normalizedError: ErrorWithStatus =
    error instanceof Error
      ? (error as ErrorWithStatus)
      : Object.assign(
          new Error("An unknown error occurred."),
          {
            statusCode: 500,
          },
        );

  const statusCode =
    error instanceof AppError
      ? error.statusCode
      : normalizedError.statusCode ??
        normalizedError.status ??
        500;

  const isServerError = statusCode >= 500;

  response.status(statusCode).json({
    message: isServerError
      ? "An unexpected server error occurred."
      : normalizedError.message,

    ...(error instanceof AppError &&
    error.code
      ? {
          code: error.code,
        }
      : {}),

    ...(error instanceof AppError &&
    error.details !== undefined
      ? {
          details: error.details,
        }
      : {}),

    ...(env.NODE_ENV === "development"
      ? {
          error: normalizedError.message,
          stack: normalizedError.stack,
        }
      : {}),
  });
};