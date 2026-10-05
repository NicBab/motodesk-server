import type {
  Request,
  Response,
} from "express";

//************************************************************** */

export function notFoundHandler(
  request: Request,
  response: Response,
): void {
  //************************************************************** */
  // Never reflect the raw originalUrl.
  //
  // originalUrl includes the query string, which may contain
  // credentials, one-time codes, integration parameters, or other
  // sensitive values supplied by the caller.
  //
  // request.path contains only the URL pathname.

  response.status(404).json({
    success:
      false,

    code:
      "ROUTE_NOT_FOUND",

    message:
      "Route not found.",

    path:
      request.path,
  });
}

//************************************************************** */