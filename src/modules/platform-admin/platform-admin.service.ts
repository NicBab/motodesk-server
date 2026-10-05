import {
  AppError,
} from "../../platform/errors/app-error.js";

import {
  createPaginatedData,
  type PaginationInput,
} from "../../platform/http/pagination.js";

import {
  findPlatformGrowth,
  findPlatformMemberships,
  findPlatformOrganizationDetail,
  findPlatformOrganizations,
  findPlatformOverviewCounts,
  findPlatformUserDetail,
  findPlatformUsers,
  type PlatformGrowthRange,
  type PlatformOrganizationFilters,
  type PlatformUserFilters,
} from "./platform-admin.repository.js";

import type {
  PlatformDateRangeQueryInput,
} from "./platform-admin.schemas.js";

//************************************************************** */

function toGrowthRange(
  input: PlatformDateRangeQueryInput,
): PlatformGrowthRange {
  return {
    from: new Date(`${input.from}T00:00:00.000Z`),
    before: new Date(`${input.before}T00:00:00.000Z`),
  };
}

//************************************************************** */

function billingAvailability() {
  return {
    status: "NOT_CONFIGURED" as const,
    provider: null,
    activeSubscriptions: null,
    trialingSubscriptions: null,
    pastDueSubscriptions: null,
    monthlyRecurringRevenue: null,
    collectedPayments: null,
    failedPayments: null,
    currency: null,

    message:
      "Subscription and revenue metrics become available after Stripe integration.",
  };
}

//************************************************************** */

function subscriptionAvailability() {
  return {
    status: "NOT_CONFIGURED" as const,
    plan: null,
    currentPeriodEnd: null,
  };
}

//************************************************************** */

function safeCount(value: bigint): number {
  const count = Number(value);

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new AppError(
      500,
      "A dashboard count could not be represented safely.",
      {
        code: "PLATFORM_METRIC_OUT_OF_RANGE",
      },
    );
  }

  return count;
}

//************************************************************** */

export async function getPlatformOverview(
  input: PlatformDateRangeQueryInput,
) {
  const counts = await findPlatformOverviewCounts(
    toGrowthRange(input),
  );

  return {
    generatedAt: new Date().toISOString(),

    range: {
      from: input.from,
      before: input.before,
      timezone: "UTC",
    },

    organizations: {
      total: counts.totalOrganizations,
      active: counts.activeOrganizations,
      archived: counts.archivedOrganizations,
      newInRange: counts.newOrganizations,
    },

    users: {
      total: counts.totalUsers,
      enabled: counts.enabledUsers,
      verified: counts.verifiedUsers,
      newInRange: counts.newUsers,
    },

    memberships: {
      active: counts.activeMemberships,
    },

    billing: billingAvailability(),
  };
}

//************************************************************** */

export async function getPlatformGrowth(
  input: PlatformDateRangeQueryInput,
) {
  const range = toGrowthRange(input);

  const result = await findPlatformGrowth(range);

  const rowsByDate = new Map(
    result.rows.map((row) => [row.date, row]),
  );

  let cumulativeOrganizations =
    result.organizationsBeforeRange;

  let cumulativeUsers =
    result.usersBeforeRange;

  const points: Array<{
    date: string;
    newOrganizations: number;
    newUsers: number;
    cumulativeOrganizations: number;
    cumulativeUsers: number;
  }> = [];

  const cursor = new Date(range.from);

  while (cursor.getTime() < range.before.getTime()) {
    const date = cursor.toISOString().slice(0, 10);
    const row = rowsByDate.get(date);

    const newOrganizations = row
      ? safeCount(row.organizations)
      : 0;

    const newUsers = row
      ? safeCount(row.users)
      : 0;

    cumulativeOrganizations += newOrganizations;
    cumulativeUsers += newUsers;

    points.push({
      date,
      newOrganizations,
      newUsers,
      cumulativeOrganizations,
      cumulativeUsers,
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    generatedAt: new Date().toISOString(),

    range: {
      from: input.from,
      before: input.before,
      timezone: "UTC",
    },

    interval: "DAY" as const,

    basis: "RETAINED_REGISTRATIONS" as const,

    description:
      "Registration dates of retained organization and user records. Deleted records and historical activity states are not reconstructed.",

    points,
  };
}

//************************************************************** */

export async function listPlatformOrganizations(
  pagination: PaginationInput,
  filters: PlatformOrganizationFilters,
) {
  const result = await findPlatformOrganizations(
    pagination,
    filters,
  );

  const items = result.items.map((organization) => {
    const { _count, ...fields } = organization;

    return {
      ...fields,
      activeMembershipCount: _count.memberships,
      subscription: subscriptionAvailability(),
    };
  });

  return createPaginatedData(
    items,
    pagination,
    result.totalItems,
  );
}

//************************************************************** */

export async function listPlatformUsers(
  pagination: PaginationInput,
  filters: PlatformUserFilters,
) {
  const result = await findPlatformUsers(
    pagination,
    filters,
  );

  const items = result.items.map((user) => {
    const { _count, ...fields } = user;

    return {
      ...fields,
      activeMembershipCount: _count.memberships,
    };
  });

  return createPaginatedData(
    items,
    pagination,
    result.totalItems,
  );
}

//************************************************************** */

export async function getPlatformOrganization(
  organizationId: string,
) {
  const organization =
    await findPlatformOrganizationDetail(organizationId);

  if (!organization) {
    throw new AppError(
      404,
      "Organization not found.",
      {
        code: "PLATFORM_ORGANIZATION_NOT_FOUND",
      },
    );
  }

  const { _count, ...fields } = organization;

  return {
    ...fields,

    activeMembershipCount: _count.memberships,

    recordCounts: {
      customers: _count.customers,
      vehicles: _count.vehicles,
      repairOrders: _count.repairOrders,
      parts: _count.parts,
      purchaseOrders: _count.purchaseOrders,
      sales: _count.sales,
    },

    subscription: subscriptionAvailability(),
  };
}

//************************************************************** */

export async function getPlatformUser(userId: string) {
  const user = await findPlatformUserDetail(userId);

  if (!user) {
    throw new AppError(
      404,
      "User not found.",
      {
        code: "PLATFORM_USER_NOT_FOUND",
      },
    );
  }

  const { _count, ...fields } = user;

  return {
    ...fields,
    activeMembershipCount: _count.memberships,
  };
}

//************************************************************** */

export async function listPlatformOrganizationMemberships(
  organizationId: string,
  pagination: PaginationInput,
) {
  // Distinguish an unknown organization from an empty member list.
  await getPlatformOrganization(organizationId);

  const result = await findPlatformMemberships(
    pagination,
    { organizationId },
  );

  return createPaginatedData(
    result.items,
    pagination,
    result.totalItems,
  );
}

//************************************************************** */

export async function listPlatformUserMemberships(
  userId: string,
  pagination: PaginationInput,
) {
  await getPlatformUser(userId);

  const result = await findPlatformMemberships(
    pagination,
    { userId },
  );

  return createPaginatedData(
    result.items,
    pagination,
    result.totalItems,
  );
}

//************************************************************** */