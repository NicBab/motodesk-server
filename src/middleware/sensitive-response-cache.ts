import type {
  NextFunction,
  Request,
  Response,
} from "express";

//************************************************************** */

export function preventSensitiveResponseCaching(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader(
    "Cache-Control",
    "private, no-store",
  );

  response.setHeader(
    "Pragma",
    "no-cache",
  );

  response.setHeader(
    "Expires",
    "0",
  );

  next();
}

//************************************************************** */