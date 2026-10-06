import type {
  Prisma,
} from "../../generated/prisma/client.js";

import {
  createPaginatedData,
  type PaginationInput,
} from "../../platform/http/pagination.js";

import {
  sanitizeAuditValue,
} from "../audit/audit.utils.js";

import {
  findPlatformAuditLogs,
  type PlatformAuditFilters,
} from "./platform-audit.repository.js";

//************************************************************** */

export async function listPlatformAuditLogs(
  pagination: PaginationInput,
  filters: PlatformAuditFilters,
) {
  const result = await findPlatformAuditLogs(
    pagination,
    filters,
  );

  const items = result.items.map((event) => ({
    ...event,

    // Reuse the existing sanitizer at response time to protect
    // historical records that may predate write-time redaction.
    metadata:
      event.metadata === null
        ? null
        : (
            sanitizeAuditValue(
              event.metadata,
            ) as Prisma.JsonValue
          ),
  }));

  return createPaginatedData(
    items,
    pagination,
    result.totalItems,
  );
}

//************************************************************** */