import type { ErrorRequestHandler } from "express";

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
    normalizedError.statusCode ??
    normalizedError.status ??
    500;

  const isServerError = statusCode >= 500;

  response.status(statusCode).json({
    message: isServerError
      ? "An unexpected server error occurred."
      : normalizedError.message,
    ...(env.NODE_ENV === "development"
      ? {
          error: normalizedError.message,
          stack: normalizedError.stack,
        }
      : {}),
  });
};