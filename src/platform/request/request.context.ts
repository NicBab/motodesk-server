import { AsyncLocalStorage } from "node:async_hooks";

import { AppError } from "../errors/app-error.js";

import type { RequestContext } from "./request.types.js";

//************************************************************** */

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

//************************************************************** */

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

//************************************************************** */

export function getRequestContext(): RequestContext {
  const context = requestContextStorage.getStore();

  if (!context) {
    throw new AppError(500, "Request context is unavailable.", {
      code: "REQUEST_CONTEXT_UNAVAILABLE",
    });
  }

  return context;
}

//************************************************************** */

export function tryGetRequestContext(): RequestContext | null {
  return requestContextStorage.getStore() ?? null;
}
