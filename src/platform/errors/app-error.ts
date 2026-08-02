export interface AppErrorOptions {
  code?: string;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(
    statusCode: number,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message, {
      ...(options.cause !== undefined
        ? {
            cause: options.cause,
          }
        : {}),
    });

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options.code;
    this.details = options.details;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}