import type { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import type { PaginationInput } from "../../platform/http/pagination.js";

import { buildPagination } from "../../platform/database/repository.js";

//************************************************************** */

export interface CreateAuditRecordData {
  action: string;
  resourceType: string;

  resourceId?: string;
  actorUserId?: string;
  organizationId?: string;

  ipAddress?: string;
  userAgent?: string;

  metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}

//************************************************************** */

export interface AuditLogFilters {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
}

//************************************************************** */

export async function createAuditRecord(data: CreateAuditRecordData) {
  return prisma.auditLog.create({
    data: {
      action: data.action,
      resourceType: data.resourceType,
      metadata: data.metadata,

      ...(data.resourceId !== undefined
        ? {
            resourceId: data.resourceId,
          }
        : {}),

      ...(data.actorUserId !== undefined
        ? {
            actorUserId: data.actorUserId,
          }
        : {}),

      ...(data.organizationId !== undefined
        ? {
            organizationId: data.organizationId,
          }
        : {}),

      ...(data.ipAddress !== undefined
        ? {
            ipAddress: data.ipAddress,
          }
        : {}),

      ...(data.userAgent !== undefined
        ? {
            userAgent: data.userAgent,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function findAuditLogsByOrganization(
  organizationId: string,
  pagination: PaginationInput,
  filters: AuditLogFilters,
) {
  return prisma.auditLog.findMany({
    where: {
      organizationId,

      ...(filters.action !== undefined
        ? {
            action: filters.action,
          }
        : {}),

      ...(filters.resourceType !== undefined
        ? {
            resourceType: filters.resourceType,
          }
        : {}),

      ...(filters.resourceId !== undefined
        ? {
            resourceId: filters.resourceId,
          }
        : {}),

      ...(filters.actorUserId !== undefined
        ? {
            actorUserId: filters.actorUserId,
          }
        : {}),
    },

    ...buildPagination(pagination.page, pagination.pageSize),

    orderBy: {
      createdAt: "desc",
    },
  });
}

//************************************************************** */

export async function countAuditLogsByOrganization(
  organizationId: string,
  filters: AuditLogFilters,
): Promise<number> {
  return prisma.auditLog.count({
    where: {
      organizationId,

      ...(filters.action !== undefined
        ? {
            action: filters.action,
          }
        : {}),

      ...(filters.resourceType !== undefined
        ? {
            resourceType: filters.resourceType,
          }
        : {}),

      ...(filters.resourceId !== undefined
        ? {
            resourceId: filters.resourceId,
          }
        : {}),

      ...(filters.actorUserId !== undefined
        ? {
            actorUserId: filters.actorUserId,
          }
        : {}),
    },
  });
}

//************************************************************** */
