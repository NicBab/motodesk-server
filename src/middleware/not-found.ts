// import type {
//   NextFunction,
//   Request,
//   Response,
// } from "express";

// export function notFoundHandler(
//   request: Request,
//   _response: Response,
//   next: NextFunction
// ): void {
//   const error = new Error(
//     `Route not found: ${request.method} ${request.originalUrl}`
//   );

//   next(error);
// }


import type { Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}