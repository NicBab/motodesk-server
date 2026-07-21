// import type {
//   NextFunction,
//   Request,
//   Response,
// } from "express";

// import { env } from "../config/env.js";

// type ErrorWithStatus = Error & {
//   statusCode?: number;
// };

// export function errorHandler(
//   error: ErrorWithStatus,
//   _request: Request,
//   response: Response,
//   _next: NextFunction
// ): void {
//   const statusCode = error.statusCode ?? 500;

//   if (env.NODE_ENV !== "test") {
//     console.error(error);
//   }

//   response.status(statusCode).json({
//     success: false,
//     message:
//       statusCode === 500
//         ? "Internal server error"
//         : error.message,

//     ...(env.NODE_ENV === "development" && {
//       stack: error.stack,
//     }),
//   });
// }


import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}