import type { Response } from "express";

import {
  ok,
} from "../../platform/http/api-response.js";

import {
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import type {
  PlatformAdminRequest,
} from "./platform-admin.middleware.js";

import type {
  PlatformAuditQueryInput,
} from "./platform-audit.schemas.js";

import {
  listPlatformAuditLogs,
} from "./platform-audit.service.js";

//************************************************************** */

export async function listPlatformAuditLogsHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const query =
    requireValidatedQuery<PlatformAuditQueryInput>(
      request,
    );

  const auditLogs = await listPlatformAuditLogs(
    {
      page: query.page,
      pageSize: query.pageSize,
    },
    {
      scope: query.scope,

      ...(query.search !== undefined
        ? { search: query.search }
        : {}),

      ...(query.action !== undefined
        ? { action: query.action }
        : {}),

      ...(query.resourceType !== undefined
        ? { resourceType: query.resourceType }
        : {}),

      ...(query.resourceId !== undefined
        ? { resourceId: query.resourceId }
        : {}),

      ...(query.actorUserId !== undefined
        ? { actorUserId: query.actorUserId }
        : {}),

      ...(query.organizationId !== undefined
        ? { organizationId: query.organizationId }
        : {}),

      ...(query.createdFrom !== undefined
        ? { createdFrom: query.createdFrom }
        : {}),

      ...(query.createdBefore !== undefined
        ? { createdBefore: query.createdBefore }
        : {}),
    },
  );

  ok(response, auditLogs);
}

//************************************************************** */