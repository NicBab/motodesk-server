import type {
  ErrorRequestHandler,
} from "express";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import {
  AppError,
} from "../platform/errors/app-error.js";

import {
  createErrorResponse,
} from "../platform/http/api-error.js";

//************************************************************** */

interface HttpParserError
  extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
}

//************************************************************** */

function isMalformedJsonError(
  error: unknown,
): error is HttpParserError {
  if (
    !(error instanceof SyntaxError)
  ) {
    return false;
  }

  const parserError =
    error as HttpParserError;

  return (
    parserError.status === 400 &&
    parserError.type ===
      "entity.parse.failed"
  );
}

//************************************************************** */

function isPayloadTooLargeError(
  error: unknown,
): error is HttpParserError {
  if (
    !(error instanceof Error)
  ) {
    return false;
  }

  const parserError =
    error as HttpParserError;

  return (
    parserError.status === 413 ||
    parserError.statusCode === 413 ||
    parserError.type ===
      "entity.too.large"
  );
}

//************************************************************** */

export const errorHandler:
  ErrorRequestHandler = (
    error,
    request,
    response,
    _next,
  ): void => {
    //************************************************************** */
    // Express/body-parser parsing failures are client request errors,
    // not unexpected application failures.

    if (
      isMalformedJsonError(
        error,
      )
    ) {
      response
        .status(400)
        .json(
          createErrorResponse(
            "Malformed JSON request body.",
            "MALFORMED_JSON",
          ),
        );

      return;
    }

    //************************************************************** */

    if (
      isPayloadTooLargeError(
        error,
      )
    ) {
      response
        .status(413)
        .json(
          createErrorResponse(
            "Request body is too large.",
            "PAYLOAD_TOO_LARGE",
          ),
        );

      return;
    }

    //************************************************************** */

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

    //************************************************************** */
    // Unexpected failures are logged internally with request context.
    // The client still receives only the generic production-safe
    // server-error response below.

    if (
      !isOperationalError
    ) {
      logger.error(
        "Unhandled application error",
        {
          error:
            normalizedError,

          method:
            request.method,

          path:
            request.path,

          ipAddress:
            request.ip ??
            request.socket
              .remoteAddress ??
            "unknown",

          requestId:
            response.getHeader(
              "X-Request-Id",
            ),
        },
      );
    }

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

        ...(
          env.NODE_ENV ===
          "development"
            ? {
                error:
                  normalizedError.message,

                stack:
                  normalizedError.stack,
              }
            : {}
        ),
      });
  };

//************************************************************** */




// import type { ErrorRequestHandler } from "express";

// import { env } from "../config/env.js";

// import { logger } from "../config/logger.js";

// import { AppError } from "../platform/errors/app-error.js";

// import { createErrorResponse } from "../platform/http/api-error.js";

// //************************************************************** */

// export const errorHandler: ErrorRequestHandler = (
//   error,
//   request,
//   response,
//   _next,
// ): void => {
//   const normalizedError =
//     error instanceof Error ? error : new Error("An unknown error occurred.");

//   const isOperationalError = error instanceof AppError;

//   const statusCode = isOperationalError ? error.statusCode : 500;

//   //************************************************************** */
//   // Unexpected failures are logged internally with request context.
//   // The client still receives only the generic production-safe
//   // server-error response below.

//   if (!isOperationalError) {
//     logger.error("Unhandled application error", {
//       error: normalizedError,

//       method: request.method,

//       path: request.originalUrl,

//       ipAddress: request.ip ?? request.socket.remoteAddress ?? "unknown",

//       requestId: response.getHeader("X-Request-Id"),
//     });
//   }

//   const responseBody = createErrorResponse(
//     isOperationalError
//       ? normalizedError.message
//       : "An unexpected server error occurred.",

//     isOperationalError ? error.code : undefined,

//     isOperationalError ? error.details : undefined,
//   );

//   response.status(statusCode).json({
//     ...responseBody,

//     ...(env.NODE_ENV === "development"
//       ? {
//           error: normalizedError.message,

//           stack: normalizedError.stack,
//         }
//       : {}),
//   });
// };

// //************************************************************** */
