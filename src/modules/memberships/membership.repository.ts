import {
  MembershipStatus,
  type MembershipRole,
  type Prisma,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  MembershipUpdateData,
  MembershipListFilters,
} from "./membership.types.js";

import type {
  PaginationInput,
} from "../../platform/http/pagination.js";

import {
  buildPagination,
} from "../../platform/database/repository.js";

import type {
  Permission,
} from "../permissions/permission.constants.js";

import {
  assertOrganizationUserCapacity,
  lockOrganizationUserCapacity,
} from "../billing/billing-capacity.service.js";

//************************************************************** */

export async function findMembershipsByOrganization(
  organizationId: string,
  pagination?: PaginationInput,
  filters: MembershipListFilters = {},
) {
  return prisma.membership.findMany({
    where: {
      organizationId,

      ...(filters.status !== undefined
        ? { status: filters.status }
        : {}),

      ...(filters.role !== undefined
        ? { role: filters.role }
        : {}),

      ...(filters.search !== undefined
        ? {
            user: {
              OR: [
                {
                  firstName: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
                {
                  lastName: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
                {
                  email: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
              ],
            },
          }
        : {}),
    },

    ...(pagination !== undefined
      ? buildPagination(pagination.page, pagination.pageSize)
      : {}),

    include: {
      user: true,
      organization: true,
    },

    orderBy: {
      createdAt: "asc",
    },
  });
}

//************************************************************** */

export async function countMembershipsByOrganization(
  organizationId: string,
  filters: MembershipListFilters = {},
): Promise<number> {
  return prisma.membership.count({
    where: {
      organizationId,

      ...(filters.status !== undefined
        ? { status: filters.status }
        : {}),

      ...(filters.role !== undefined
        ? { role: filters.role }
        : {}),

      ...(filters.search !== undefined
        ? {
            user: {
              OR: [
                {
                  firstName: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
                {
                  lastName: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
                {
                  email: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
              ],
            },
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function findMembershipById(
  organizationId: string,
  membershipId: string,
) {
  return prisma.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
    },

    include: {
      user: true,
      organization: true,
    },
  });
}

//************************************************************** */

export async function findMembershipForUpdate(
  organizationId: string,
  membershipId: string,
) {
  return prisma.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
    },
  });
}

//************************************************************** */

export async function findUserForMembershipByEmail(
  email: string,
) {
  return prisma.user.findUnique({
    where: {
      email,
    },

    select: {
      id: true,
    },
  });
}

//************************************************************** */

export async function findMembershipByUserAndOrganization(
  userId: string,
  organizationId: string,
) {
  return prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  });
}

//************************************************************** */

async function prepareMembershipUpdate(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  membershipId: string,
  data: MembershipUpdateData,
): Promise<void> {
  await lockOrganizationUserCapacity(
    transaction,
    organizationId,
  );

  // Re-read after locking; an earlier service-layer read may
  // have been overtaken by another membership update.
  const current = await transaction.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
    },
  });

  if (!current) {
    throw new AppError(404, "Membership not found.", {
      code: "MEMBERSHIP_NOT_FOUND",
    });
  }

  const targetStatus = data.status ?? current.status;

  const becomesActive =
    targetStatus === MembershipStatus.ACTIVE &&
    current.status !== MembershipStatus.ACTIVE;

  const becomesReserved =
    targetStatus === MembershipStatus.INVITED &&
    current.status !== MembershipStatus.INVITED &&
    current.status !== MembershipStatus.ACTIVE;

  if (becomesActive || becomesReserved) {
    await assertOrganizationUserCapacity(
      transaction,
      organizationId,
      {
        excludeMembershipId: membershipId,
      },
    );
  }
}

//************************************************************** */

export async function createMembershipWithPermissions(
  organizationId: string,
  userId: string,
  role: MembershipRole,
  permissions: Permission[],
  grantedByMembershipId: string,
) {
  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const existing = await transaction.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });

    if (existing) {
      throw new AppError(
        409,
        "User is already a member of this organization.",
        {
          code: "MEMBERSHIP_ALREADY_EXISTS",
        },
      );
    }

    const user = await transaction.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        email: true,
      },
    });

    if (!user) {
      throw new AppError(404, "User not found.", {
        code: "USER_NOT_FOUND",
      });
    }

    // A pending invitation already reserves this person's slot.
    // Use invitation acceptance so its reservation and employee
    // linkage are resolved through the existing invitation flow.
    const pendingInvitation =
      await transaction.membershipInvitation.findFirst({
        where: {
          organizationId,

          email: {
            equals: user.email,
            mode: "insensitive",
          },

          acceptedAt: null,
          revokedAt: null,

          expiresAt: {
            gt: new Date(),
          },
        },

        select: {
          id: true,
        },
      });

    if (pendingInvitation) {
      throw new AppError(
        409,
        "A pending invitation already exists for this user. Complete the invitation or revoke it before adding the user directly.",
        {
          code: "MEMBERSHIP_INVITATION_ALREADY_EXISTS",
        },
      );
    }

    await assertOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const membership = await transaction.membership.create({
      data: {
        organizationId,
        userId,
        role,
        status: MembershipStatus.ACTIVE,
      },

      include: {
        user: true,
        organization: true,
      },
    });

    if (permissions.length > 0) {
      await transaction.membershipPermission.createMany({
        data: permissions.map((permission) => ({
          organizationId,
          membershipId: membership.id,
          permission,
          grantedByMembershipId,
        })),
      });
    }

    return membership;
  });
}

//************************************************************** */

export async function updateMembershipRecord(
  membershipId: string,
  data: MembershipUpdateData,
) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.membership.findUnique({
      where: {
        id: membershipId,
      },

      select: {
        organizationId: true,
      },
    });

    if (!existing) {
      throw new AppError(404, "Membership not found.", {
        code: "MEMBERSHIP_NOT_FOUND",
      });
    }

    await prepareMembershipUpdate(
      transaction,
      existing.organizationId,
      membershipId,
      data,
    );

    return transaction.membership.update({
      where: {
        id: membershipId,
        organizationId: existing.organizationId,
      },

      data: {
        ...(data.role !== undefined
          ? { role: data.role }
          : {}),

        ...(data.status !== undefined
          ? { status: data.status }
          : {}),
      },

      include: {
        user: true,
        organization: true,
      },
    });
  });
}

//************************************************************** */

export async function updateMembershipRoleAndPermissions(
  organizationId: string,
  membershipId: string,
  data: MembershipUpdateData,
  permissions: Permission[],
  grantedByMembershipId: string,
) {
  return prisma.$transaction(async (transaction) => {
    await prepareMembershipUpdate(
      transaction,
      organizationId,
      membershipId,
      data,
    );

    const membership = await transaction.membership.update({
      where: {
        id: membershipId,
        organizationId,
      },

      data: {
        ...(data.role !== undefined
          ? { role: data.role }
          : {}),

        ...(data.status !== undefined
          ? { status: data.status }
          : {}),
      },

      include: {
        user: true,
        organization: true,
      },
    });

    await transaction.membershipPermission.deleteMany({
      where: {
        organizationId,
        membershipId,
      },
    });

    if (permissions.length > 0) {
      await transaction.membershipPermission.createMany({
        data: permissions.map((permission) => ({
          organizationId,
          membershipId,
          permission,
          grantedByMembershipId,
        })),
      });
    }

    return membership;
  });
}

//************************************************************** */

export async function removeMembershipRecord(
  organizationId: string,
  membershipId: string,
) {
  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const existing = await transaction.membership.findFirst({
      where: {
        id: membershipId,
        organizationId,
      },

      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new AppError(404, "Membership not found.", {
        code: "MEMBERSHIP_NOT_FOUND",
      });
    }

    const membership = await transaction.membership.update({
      where: {
        id: membershipId,
        organizationId,
      },

      data: {
        status: MembershipStatus.REMOVED,
      },

      include: {
        user: true,
        organization: true,
      },
    });

    await transaction.membershipPermission.deleteMany({
      where: {
        organizationId,
        membershipId,
      },
    });

    return membership;
  });
}

//************************************************************** */