import type { Response } from "express";

import { ok } from "../../platform/http/api-response.js";

import { requireValidatedQuery } from "../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import { listPartOrderDemand } from "./part-order-demand.service.js";

import type { ListPartOrderDemandQueryInput } from "./part-order-demand.schemas.js";

//************************************************************** */

export async function listPartOrderDemandHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = String(request.params.organizationId);

  const query = requireValidatedQuery<ListPartOrderDemandQueryInput>(request);

  const demand = await listPartOrderDemand(organizationId, query);

  ok(response, demand);
}

//************************************************************** */
