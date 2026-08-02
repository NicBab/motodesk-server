export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: string;
  details?: unknown;
}

//************************************************************** */

export function createErrorResponse(
  message: string,
  code?: string,
  details?: unknown,
): ApiErrorResponse {
  return {
    success: false,
    message,

    ...(code !== undefined
      ? { code }
      : {}),

    ...(details !== undefined
      ? { details }
      : {}),
  };
}