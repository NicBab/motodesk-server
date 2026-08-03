import type { RequestHandler } from "express";

import { createErrorResponse } from "../platform/http/api-error.js";

export const notFoundHandler: RequestHandler = (
  request,
  response,
): void => {
  const responseBody = createErrorResponse(
    `Route not found: ${request.method} ${request.originalUrl}`,
    "ROUTE_NOT_FOUND",
  );

  response.status(404).json(responseBody);
};