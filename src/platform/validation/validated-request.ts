import type { Request } from "express";

import { AppError } from "../errors/app-error.js";

//************************************************************** */

export interface ValidatedRequest<
  TBody = unknown,
  TParams = unknown,
  TQuery = unknown,
> extends Request {
  validatedBody?: TBody;
  validatedParams?: TParams;
  validatedQuery?: TQuery;
}

//************************************************************** */

export function requireValidatedBody<T>(
  request: Request,
): T {
  const body = (
    request as ValidatedRequest<T>
  ).validatedBody;

  if (body === undefined) {
    throw new AppError(
      500,
      "Validated request body is unavailable.",
      {
        code: "VALIDATED_BODY_UNAVAILABLE",
      },
    );
  }

  return body;
}

//************************************************************** */

export function requireValidatedParams<T>(
  request: Request,
): T {
  const params = (
    request as ValidatedRequest<
      unknown,
      T
    >
  ).validatedParams;

  if (params === undefined) {
    throw new AppError(
      500,
      "Validated route parameters are unavailable.",
      {
        code: "VALIDATED_PARAMS_UNAVAILABLE",
      },
    );
  }

  return params;
}

//************************************************************** */

export function requireValidatedQuery<T>(
  request: Request,
): T {
  const query = (
    request as ValidatedRequest<
      unknown,
      unknown,
      T
    >
  ).validatedQuery;

  if (query === undefined) {
    throw new AppError(
      500,
      "Validated query data is unavailable.",
      {
        code: "VALIDATED_QUERY_UNAVAILABLE",
      },
    );
  }

  return query;
}