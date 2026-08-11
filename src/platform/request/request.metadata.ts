import type {
  Request,
} from "express";

//************************************************************** */

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

//************************************************************** */

export function getRequestMetadata(
  request: Request,
): RequestMetadata {
  return {
    ipAddress:
      request.ip ?? null,
    userAgent:
      request.get("user-agent") ?? null,
  };
}