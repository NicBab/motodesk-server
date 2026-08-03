import type { ErrorRequestHandler } from "express";

import { env } from "../config/env.js";
import { AppError } from "../platform/errors/app-error.js";
import { createErrorResponse } from "../platform/http/api-error.js";

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

  const isServerError =
    statusCode >= 500;

  const responseBody =
    createErrorResponse(
      isServerError
        ? "An unexpected server error occurred."
        : normalizedError.message,

      error instanceof AppError
        ? error.code
        : undefined,

      error instanceof AppError
        ? error.details
        : undefined,
    );

  response.status(statusCode).json({
    ...responseBody,

    ...(env.NODE_ENV === "development"
      ? {
          error: normalizedError.message,
          stack: normalizedError.stack,
        }
      : {}),
  });
};