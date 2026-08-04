import type { Request } from "express";

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