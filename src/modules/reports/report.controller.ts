import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import { ok } from "../../platform/http/api-response.js";

import { requireValidatedQuery } from "../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import type { ReportOverviewQueryInput } from "./report.schemas.js";

import { getReportOverview } from "./report.service.js";

//************************************************************** */

function requireOrganizationId(request: AuthenticatedRequest): string {
  const organizationId = request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(400, "A valid organization ID is required.", {
      code: "ORGANIZATION_ID_REQUIRED",
    });
  }

  return organizationId;
}

//************************************************************** */

export async function getReportOverviewHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query = requireValidatedQuery<ReportOverviewQueryInput>(request);

  const report = await getReportOverview(organizationId, query);

  ok(response, report);
}

//************************************************************** */
