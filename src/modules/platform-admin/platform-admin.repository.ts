import {
  Prisma,
  type OrganizationStatus,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import {
  buildPagination,
} from "../../platform/database/repository.js";

import type {
  PaginationInput,
} from "../../platform/http/pagination.js";

//************************************************************** */

export interface PlatformOrganizationFilters {
  search?: string;
  status?: OrganizationStatus;
}

export interface PlatformUserFilters {
  search?: string;
  isActive?: boolean;
}

export interface PlatformGrowthRange {
  from: Date;
  before: Date;
}

export interface PlatformGrowthRow {
  date: string;
  organizations: bigint;
  users: bigint;
}

//************************************************************** */

const platformUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

//************************************************************** */

function organizationWhere(
  filters: PlatformOrganizationFilters,
): Prisma.OrganizationWhereInput {
  return {
    ...(filters.status !== undefined
      ? { status: filters.status }
      : {}),

    ...(filters.search !== undefined
      ? {
          OR: [
            {
              name: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
            {
              slug: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
            {
              email: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
            {
              id: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };
}

//************************************************************** */

function userWhere(
  filters: PlatformUserFilters,
): Prisma.UserWhereInput {
  return {
    ...(filters.isActive !== undefined
      ? { isActive: filters.isActive }
      : {}),

    ...(filters.search !== undefined
      ? {
          OR: [
            {
              email: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
            {
              firstName: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
            {
              lastName: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
            {
              id: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };
}

//************************************************************** */

export async function findPlatformOverviewCounts(
  range: PlatformGrowthRange,
) {
  const [
    totalOrganizations,
    activeOrganizations,
    archivedOrganizations,
    totalUsers,
    enabledUsers,
    verifiedUsers,
    activeMemberships,
    newOrganizations,
    newUsers,
  ] = await prisma.$transaction([
    prisma.organization.count(),

    prisma.organization.count({
      where: { status: "ACTIVE" },
    }),

    prisma.organization.count({
      where: { status: "ARCHIVED" },
    }),

    prisma.user.count(),

    // Enabled accounts are not a measure of recent user activity.
    prisma.user.count({
      where: { isActive: true },
    }),

    prisma.user.count({
      where: { emailVerifiedAt: { not: null } },
    }),

    // Count membership status, independently of account/org status.
    prisma.membership.count({
      where: { status: "ACTIVE" },
    }),

    prisma.organization.count({
      where: {
        createdAt: {
          gte: range.from,
          lt: range.before,
        },
      },
    }),

    prisma.user.count({
      where: {
        createdAt: {
          gte: range.from,
          lt: range.before,
        },
      },
    }),
  ], {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });

  return {
    totalOrganizations,
    activeOrganizations,
    archivedOrganizations,
    totalUsers,
    enabledUsers,
    verifiedUsers,
    activeMemberships,
    newOrganizations,
    newUsers,
  };
}

//************************************************************** */

export async function findPlatformOrganizations(
  pagination: PaginationInput,
  filters: PlatformOrganizationFilters,
) {
  const where = organizationWhere(filters);

  const [items, totalItems] = await prisma.$transaction([
    prisma.organization.findMany({
      where,

      ...buildPagination(pagination.page, pagination.pageSize),

      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],

      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        _count: {
          select: {
            memberships: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    }),

    prisma.organization.count({ where }),
  ], {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });

  return { items, totalItems };
}

//************************************************************** */

export async function findPlatformUsers(
  pagination: PaginationInput,
  filters: PlatformUserFilters,
) {
  const where = userWhere(filters);

  const [items, totalItems] = await prisma.$transaction([
    prisma.user.findMany({
      where,

      ...buildPagination(pagination.page, pagination.pageSize),

      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],

      select: {
        ...platformUserSelect,

        _count: {
          select: {
            memberships: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    }),

    prisma.user.count({ where }),
  ], {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });

  return { items, totalItems };
}

//************************************************************** */

export async function findPlatformOrganizationDetail(
  organizationId: string,
) {
  return prisma.organization.findUnique({
    where: { id: organizationId },

    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      updatedAt: true,

      _count: {
        select: {
          memberships: {
            where: { status: "ACTIVE" },
          },
          customers: true,
          vehicles: true,
          repairOrders: true,
          parts: true,
          purchaseOrders: true,
          sales: true,
        },
      },
    },
  });
}

//************************************************************** */

export async function findPlatformUserDetail(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },

    select: {
      ...platformUserSelect,

      _count: {
        select: {
          memberships: {
            where: { status: "ACTIVE" },
          },
        },
      },
    },
  });
}

//************************************************************** */

// Membership details are paginated separately to avoid unbounded
// nested collections in organization/user detail responses.
export async function findPlatformMemberships(
  pagination: PaginationInput,
  filter: {
    organizationId?: string;
    userId?: string;
  },
) {
  const where: Prisma.MembershipWhereInput = {
    status: { not: "REMOVED" },

    ...(filter.organizationId !== undefined
      ? { organizationId: filter.organizationId }
      : {}),

    ...(filter.userId !== undefined
      ? { userId: filter.userId }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.membership.findMany({
      where,

      ...buildPagination(pagination.page, pagination.pageSize),

      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],

      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,

        user: {
          select: platformUserSelect,
        },

        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
    }),

    prisma.membership.count({ where }),
  ], {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });

  return { items, totalItems };
}

//************************************************************** */

export async function findPlatformGrowth(
  range: PlatformGrowthRange,
) {
  const [rows, organizationsBeforeRange, usersBeforeRange] =
    await prisma.$transaction([
      prisma.$queryRaw<PlatformGrowthRow[]>`
        SELECT
          to_char("day", 'YYYY-MM-DD') AS "date",
          SUM("organizations")::bigint AS "organizations",
          SUM("users")::bigint AS "users"
        FROM (
          SELECT
            date_trunc('day', "createdAt") AS "day",
            COUNT(*)::bigint AS "organizations",
            0::bigint AS "users"
          FROM "Organization"
          WHERE "createdAt" >= ${range.from}
            AND "createdAt" < ${range.before}
          GROUP BY 1

          UNION ALL

          SELECT
            date_trunc('day', "createdAt") AS "day",
            0::bigint AS "organizations",
            COUNT(*)::bigint AS "users"
          FROM "User"
          WHERE "createdAt" >= ${range.from}
            AND "createdAt" < ${range.before}
          GROUP BY 1
        ) AS "registrations"
        GROUP BY "day"
        ORDER BY "day" ASC
      `,

      prisma.organization.count({
        where: {
          createdAt: { lt: range.from },
        },
      }),

      prisma.user.count({
        where: {
          createdAt: { lt: range.from },
        },
      }),
    ], {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });

  return {
    rows,
    organizationsBeforeRange,
    usersBeforeRange,
  };
}

//************************************************************** */