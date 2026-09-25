import type {
  ErrorRequestHandler,
} from "express";

import {
  env,
} from "../config/env.js";

import {
  AppError,
} from "../platform/errors/app-error.js";

import {
  createErrorResponse,
} from "../platform/http/api-error.js";

//************************************************************** */

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
): void => {
  const normalizedError =
    error instanceof Error
      ? error
      : new Error(
          "An unknown error occurred.",
        );

  const isOperationalError =
    error instanceof AppError;

  const statusCode =
    isOperationalError
      ? error.statusCode
      : 500;

  const responseBody =
    createErrorResponse(
      isOperationalError
        ? normalizedError.message
        : "An unexpected server error occurred.",

      isOperationalError
        ? error.code
        : undefined,

      isOperationalError
        ? error.details
        : undefined,
    );

  response
    .status(
      statusCode,
    )
    .json({
      ...responseBody,

      ...(env.NODE_ENV ===
      "development"
        ? {
            error:
              normalizedError.message,

            stack:
              normalizedError.stack,
          }
        : {}),
    });
};

//************************************************************** */