import {
  Prisma,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import {
  buildPagination,
} from "../../platform/database/repository.js";

import type {
  PaginationInput,
} from "../../platform/http/pagination.js";

//************************************************************** */

export interface PlatformAuditFilters {
  search?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  organizationId?: string;

  scope: "ALL" | "ORGANIZATION" | "UNASSIGNED";

  createdFrom?: string;
  createdBefore?: string;
}

//************************************************************** */

function actorSearchWhere(
  search: string,
): Prisma.UserWhereInput {
  const contains = {
    contains: search,
    mode: "insensitive" as const,
  };

  const words = search.split(/\s+/).filter(Boolean);

  const nameMatches: Prisma.UserWhereInput[] = [];

  // Match contiguous first-name and last-name portions.
  // Try each split to support names containing multiple words.
  for (let split = 1; split < words.length; split += 1) {
    nameMatches.push({
      AND: [
        {
          firstName: {
            contains: words.slice(0, split).join(" "),
            mode: "insensitive",
          },
        },
        {
          lastName: {
            contains: words.slice(split).join(" "),
            mode: "insensitive",
          },
        },
      ],
    });
  }

  return {
    OR: [
      { email: contains },
      { firstName: contains },
      { lastName: contains },
      ...nameMatches,
    ],
  };
}

//************************************************************** */

function buildPlatformAuditWhere(
  filters: PlatformAuditFilters,
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.action !== undefined
      ? { action: filters.action }
      : {}),

    ...(filters.resourceType !== undefined
      ? { resourceType: filters.resourceType }
      : {}),

    ...(filters.resourceId !== undefined
      ? { resourceId: filters.resourceId }
      : {}),

    ...(filters.actorUserId !== undefined
      ? { actorUserId: filters.actorUserId }
      : {}),
  };

  if (filters.scope === "UNASSIGNED") {
    where.organizationId = null;
  } else if (filters.organizationId !== undefined) {
    where.organizationId = filters.organizationId;
  } else if (filters.scope === "ORGANIZATION") {
    where.organizationId = { not: null };
  }

  if (
    filters.createdFrom !== undefined ||
    filters.createdBefore !== undefined
  ) {
    where.createdAt = {
      ...(filters.createdFrom !== undefined
        ? { gte: new Date(filters.createdFrom) }
        : {}),

      ...(filters.createdBefore !== undefined
        ? { lt: new Date(filters.createdBefore) }
        : {}),
    };
  }

  if (filters.search !== undefined) {
    const contains = {
      contains: filters.search,
      mode: "insensitive" as const,
    };

    where.OR = [
      { id: contains },
      { action: contains },
      { resourceType: contains },
      { resourceId: contains },
      { actorUserId: contains },
      { organizationId: contains },
      { ipAddress: contains },

      {
        actorUser: {
          is: actorSearchWhere(filters.search),
        },
      },

      {
        organization: {
          is: {
            OR: [
              { name: contains },
              { slug: contains },
            ],
          },
        },
      },
    ];
  }

  return where;
}

//************************************************************** */

export async function findPlatformAuditLogs(
  pagination: PaginationInput,
  filters: PlatformAuditFilters,
) {
  const where = buildPlatformAuditWhere(filters);

  const [items, totalItems] = await prisma.$transaction(
    [
      prisma.auditLog.findMany({
        where,

        ...buildPagination(
          pagination.page,
          pagination.pageSize,
        ),

        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],

        select: {
          id: true,
          organizationId: true,
          actorUserId: true,

          action: true,
          resourceType: true,
          resourceId: true,

          ipAddress: true,
          userAgent: true,
          metadata: true,
          createdAt: true,

          actorUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },

          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),

      prisma.auditLog.count({ where }),
    ],
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );

  return {
    items,
    totalItems,
  };
}

//************************************************************** */