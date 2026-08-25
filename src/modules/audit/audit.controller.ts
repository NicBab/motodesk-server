import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import { requireValidatedQuery } from "../../platform/validation/validated-request.js";

import { ok } from "../../platform/http/api-response.js";

import { listAuditLogs } from "./audit.service.js";

import type { ListAuditLogsQueryInput } from "./audit.schemas.js";

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

export async function listAuditLogsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query = requireValidatedQuery<ListAuditLogsQueryInput>(request);

  const auditLogs = await listAuditLogs(
    organizationId,
    {
      page: query.page,

      pageSize: query.pageSize,
    },
    {
      ...(query.action !== undefined
        ? {
            action: query.action,
          }
        : {}),

      ...(query.resourceType !== undefined
        ? {
            resourceType: query.resourceType,
          }
        : {}),

      ...(query.resourceId !== undefined
        ? {
            resourceId: query.resourceId,
          }
        : {}),

      ...(query.actorUserId !== undefined
        ? {
            actorUserId: query.actorUserId,
          }
        : {}),
    },
  );

  ok(response, auditLogs);
}

//************************************************************** */
