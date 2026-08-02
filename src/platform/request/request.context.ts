import type {
  RequestContext,
} from "./request.types.js";

//************************************************************** */

let currentRequestContext:
  | RequestContext
  | null = null;

//************************************************************** */

export function setRequestContext(
  context: RequestContext,
): void {
  currentRequestContext = context;
}

//************************************************************** */

export function clearRequestContext(): void {
  currentRequestContext = null;
}

//************************************************************** */

export function getRequestContext(): RequestContext {
  if (!currentRequestContext) {
    throw new Error(
      "Request context has not been initialized.",
    );
  }

  return currentRequestContext;
}