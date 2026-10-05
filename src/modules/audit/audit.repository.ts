import type { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import type {
  PaginationInput,
} from "../../platform/http/pagination.js";

import {
  buildPagination,
} from "../../platform/database/repository.js";

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
  search?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  createdFrom?: string;
  createdBefore?: string;
}

//************************************************************** */

// Select only the actor fields needed by the administrative viewer.
const auditActorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

//************************************************************** */

function buildAuditLogWhere(
  organizationId: string,
  filters: AuditLogFilters,
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {
    organizationId,

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

    // Search explicit display fields. Do not search arbitrary metadata,
    // which may contain historical sensitive values.
    where.OR = [
      { id: contains },
      { action: contains },
      { resourceType: contains },
      { resourceId: contains },
      { actorUserId: contains },
      { ipAddress: contains },
      {
        actorUser: {
          is: {
            OR: [
              { firstName: contains },
              { lastName: contains },
              { email: contains },
              {
                AND: filters.search
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((word) => ({
                    OR: [
                      {
                        firstName: {
                          contains: word,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        lastName: {
                          contains: word,
                          mode: "insensitive" as const,
                        },
                      },
                    ],
                  })),
              },
            ],
          },
        },
      },
    ];
  }

  return where;
}

//************************************************************** */

export async function createAuditRecord(
  data: CreateAuditRecordData,
) {
  return prisma.auditLog.create({
    data: {
      action: data.action,
      resourceType: data.resourceType,
      metadata: data.metadata,

      ...(data.resourceId !== undefined
        ? { resourceId: data.resourceId }
        : {}),

      ...(data.actorUserId !== undefined
        ? { actorUserId: data.actorUserId }
        : {}),

      ...(data.organizationId !== undefined
        ? { organizationId: data.organizationId }
        : {}),

      ...(data.ipAddress !== undefined
        ? { ipAddress: data.ipAddress }
        : {}),

      ...(data.userAgent !== undefined
        ? { userAgent: data.userAgent }
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
    where: buildAuditLogWhere(organizationId, filters),

    ...buildPagination(
      pagination.page,
      pagination.pageSize,
    ),

    include: {
      actorUser: {
        select: auditActorSelect,
      },
    },

    // A unique secondary key makes ordering deterministic when
    // multiple events share the same timestamp.
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
  });
}

//************************************************************** */

export async function countAuditLogsByOrganization(
  organizationId: string,
  filters: AuditLogFilters,
): Promise<number> {
  return prisma.auditLog.count({
    where: buildAuditLogWhere(organizationId, filters),
  });
}

//************************************************************** */

// Filter choices come from this organization's recorded events,
// including actors who no longer have an organization membership.
export async function findAuditFilterOptionsByOrganization(
  organizationId: string,
) {
  const [actionRows, resourceTypeRows, actorRows] =
    await Promise.all([
      prisma.auditLog.findMany({
        where: { organizationId },

        select: {
          action: true,
        },

        distinct: ["action"],

        orderBy: {
          action: "asc",
        },
      }),

      prisma.auditLog.findMany({
        where: { organizationId },

        select: {
          resourceType: true,
        },

        distinct: ["resourceType"],

        orderBy: {
          resourceType: "asc",
        },
      }),

      prisma.auditLog.findMany({
        where: {
          organizationId,
          actorUserId: {
            not: null,
          },
        },

        select: {
          actorUserId: true,
          actorUser: {
            select: auditActorSelect,
          },
        },

        distinct: ["actorUserId"],

        orderBy: {
          actorUserId: "asc",
        },
      }),
    ]);

  return {
    actions: actionRows.map((row) => row.action),

    resourceTypes: resourceTypeRows.map(
      (row) => row.resourceType,
    ),

    actors: actorRows.flatMap((row) => {
      if (row.actorUserId === null) {
        return [];
      }

      return [{
        id: row.actorUserId,
        firstName: row.actorUser?.firstName ?? null,
        lastName: row.actorUser?.lastName ?? null,
        email: row.actorUser?.email ?? null,
      }];
    }),
  };
}

//************************************************************** */




// import type { Prisma } from "../../generated/prisma/client.js";

// import { prisma } from "../../config/prisma.js";

// import type { PaginationInput } from "../../platform/http/pagination.js";

// import { buildPagination } from "../../platform/database/repository.js";

// //************************************************************** */

// export interface CreateAuditRecordData {
//   action: string;
//   resourceType: string;

//   resourceId?: string;
//   actorUserId?: string;
//   organizationId?: string;

//   ipAddress?: string;
//   userAgent?: string;

//   metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull;
// }

// //************************************************************** */

// export interface AuditLogFilters {
//   action?: string;
//   resourceType?: string;
//   resourceId?: string;
//   actorUserId?: string;
// }

// //************************************************************** */

// export async function createAuditRecord(data: CreateAuditRecordData) {
//   return prisma.auditLog.create({
//     data: {
//       action: data.action,
//       resourceType: data.resourceType,
//       metadata: data.metadata,

//       ...(data.resourceId !== undefined
//         ? {
//             resourceId: data.resourceId,
//           }
//         : {}),

//       ...(data.actorUserId !== undefined
//         ? {
//             actorUserId: data.actorUserId,
//           }
//         : {}),

//       ...(data.organizationId !== undefined
//         ? {
//             organizationId: data.organizationId,
//           }
//         : {}),

//       ...(data.ipAddress !== undefined
//         ? {
//             ipAddress: data.ipAddress,
//           }
//         : {}),

//       ...(data.userAgent !== undefined
//         ? {
//             userAgent: data.userAgent,
//           }
//         : {}),
//     },
//   });
// }

// //************************************************************** */

// export async function findAuditLogsByOrganization(
//   organizationId: string,
//   pagination: PaginationInput,
//   filters: AuditLogFilters,
// ) {
//   return prisma.auditLog.findMany({
//     where: {
//       organizationId,

//       ...(filters.action !== undefined
//         ? {
//             action: filters.action,
//           }
//         : {}),

//       ...(filters.resourceType !== undefined
//         ? {
//             resourceType: filters.resourceType,
//           }
//         : {}),

//       ...(filters.resourceId !== undefined
//         ? {
//             resourceId: filters.resourceId,
//           }
//         : {}),

//       ...(filters.actorUserId !== undefined
//         ? {
//             actorUserId: filters.actorUserId,
//           }
//         : {}),
//     },

//     ...buildPagination(pagination.page, pagination.pageSize),

//     orderBy: {
//       createdAt: "desc",
//     },
//   });
// }

// //************************************************************** */

// export async function countAuditLogsByOrganization(
//   organizationId: string,
//   filters: AuditLogFilters,
// ): Promise<number> {
//   return prisma.auditLog.count({
//     where: {
//       organizationId,

//       ...(filters.action !== undefined
//         ? {
//             action: filters.action,
//           }
//         : {}),

//       ...(filters.resourceType !== undefined
//         ? {
//             resourceType: filters.resourceType,
//           }
//         : {}),

//       ...(filters.resourceId !== undefined
//         ? {
//             resourceId: filters.resourceId,
//           }
//         : {}),

//       ...(filters.actorUserId !== undefined
//         ? {
//             actorUserId: filters.actorUserId,
//           }
//         : {}),
//     },
//   });
// }

// //************************************************************** */
