import {
  MembershipStatus,
  type MembershipRole,
  type Prisma,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  Permission,
} from "../permissions/permission.constants.js";

import type {
  PaginationInput,
} from "../../platform/http/pagination.js";

import {
  buildPagination,
} from "../../platform/database/repository.js";

import {
  assertOrganizationUserCapacity,
  lockOrganizationUserCapacity,
} from "../billing/billing-capacity.service.js";

//************************************************************** */

function invitationNotFound(): AppError {
  return new AppError(404, "Membership invitation not found.", {
    code: "MEMBERSHIP_INVITATION_NOT_FOUND",
  });
}

function invitationAlreadyAccepted(): AppError {
  return new AppError(
    409,
    "Membership invitation has already been accepted.",
    {
      code: "MEMBERSHIP_INVITATION_ALREADY_ACCEPTED",
    },
  );
}

//************************************************************** */

async function findLockedInvitation(
  transaction: Prisma.TransactionClient,
  invitationId: string,
) {
  const mapping = await transaction.membershipInvitation.findUnique({
    where: {
      id: invitationId,
    },

    select: {
      organizationId: true,
    },
  });

  if (!mapping) {
    throw invitationNotFound();
  }

  await lockOrganizationUserCapacity(
    transaction,
    mapping.organizationId,
  );

  const invitation =
    await transaction.membershipInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId: mapping.organizationId,
      },
    });

  if (!invitation) {
    throw invitationNotFound();
  }

  return invitation;
}

//************************************************************** */

async function assertInvitationTargetAvailable(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  email: string,
  excludeInvitationId?: string,
): Promise<void> {
  const existingMembership = await transaction.membership.findFirst({
    where: {
      organizationId,

      user: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
    },

    select: {
      id: true,
    },
  });

  if (existingMembership) {
    throw new AppError(
      409,
      "User is already a member of this organization.",
      {
        code: "MEMBERSHIP_ALREADY_EXISTS",
      },
    );
  }

  const pending = await transaction.membershipInvitation.findFirst({
    where: {
      organizationId,

      email: {
        equals: email,
        mode: "insensitive",
      },

      acceptedAt: null,
      revokedAt: null,

      expiresAt: {
        gt: new Date(),
      },

      ...(excludeInvitationId
        ? {
            id: {
              not: excludeInvitationId,
            },
          }
        : {}),
    },

    select: {
      id: true,
    },
  });

  if (pending) {
    throw new AppError(
      409,
      "A pending invitation already exists for this email address.",
      {
        code: "MEMBERSHIP_INVITATION_ALREADY_EXISTS",
      },
    );
  }
}

//************************************************************** */

export async function findMembershipInvitationsByOrganization(
  organizationId: string,
  pagination?: PaginationInput,
) {
  return prisma.membershipInvitation.findMany({
    where: {
      organizationId,
    },

    ...(pagination !== undefined
      ? buildPagination(pagination.page, pagination.pageSize)
      : {}),

    orderBy: {
      createdAt: "desc",
    },
  });
}

//************************************************************** */

export async function countMembershipInvitationsByOrganization(
  organizationId: string,
): Promise<number> {
  return prisma.membershipInvitation.count({
    where: {
      organizationId,
    },
  });
}

//************************************************************** */

export async function findPendingMembershipInvitationByEmail(
  organizationId: string,
  email: string,
) {
  return prisma.membershipInvitation.findFirst({
    where: {
      organizationId,
      email,
      acceptedAt: null,
      revokedAt: null,

      expiresAt: {
        gt: new Date(),
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });
}

//************************************************************** */

export async function findMembershipInvitationById(
  organizationId: string,
  invitationId: string,
) {
  return prisma.membershipInvitation.findFirst({
    where: {
      id: invitationId,
      organizationId,
    },
  });
}

//************************************************************** */

export async function findMembershipInvitationByTokenHash(
  tokenHash: string,
) {
  return prisma.membershipInvitation.findUnique({
    where: {
      tokenHash,
    },

    include: {
      organization: true,
      invitedBy: true,
    },
  });
}

//************************************************************** */

export async function createMembershipInvitationRecord(
  organizationId: string,
  invitedByMembershipId: string,
  email: string,
  role: MembershipRole,
  tokenHash: string,
  expiresAt: Date,
  employeeId?: string,
) {
  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const normalizedEmail = email.trim().toLowerCase();

    await assertInvitationTargetAvailable(
      transaction,
      organizationId,
      normalizedEmail,
    );

    const inviter = await transaction.membership.findFirst({
      where: {
        id: invitedByMembershipId,
        organizationId,
        status: MembershipStatus.ACTIVE,
      },

      select: {
        id: true,
      },
    });

    if (!inviter) {
      throw new AppError(404, "Membership not found.", {
        code: "MEMBERSHIP_NOT_FOUND",
      });
    }

    if (employeeId) {
      const employee = await transaction.employee.findFirst({
        where: {
          id: employeeId,
          organizationId,
        },
      });

      if (!employee) {
        throw new AppError(404, "Employee not found.", {
          code: "MEMBERSHIP_INVITATION_EMPLOYEE_NOT_FOUND",
        });
      }

      if (employee.membershipId) {
        throw new AppError(
          409,
          "Employee already has MotoDesk application access.",
          {
            code: "EMPLOYEE_MEMBERSHIP_ALREADY_LINKED",
          },
        );
      }

      if (
        employee.email &&
        employee.email.trim().toLowerCase() !== normalizedEmail
      ) {
        throw new AppError(
          400,
          "Invitation email must match the employee email address.",
          {
            code: "EMPLOYEE_INVITATION_EMAIL_MISMATCH",
          },
        );
      }
    }

    await assertOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    return transaction.membershipInvitation.create({
      data: {
        organizationId,
        invitedByMembershipId,
        employeeId: employeeId ?? null,
        email: normalizedEmail,
        role,
        tokenHash,
        expiresAt,
      },

      include: {
        organization: true,
        invitedBy: true,
      },
    });
  });
}

//************************************************************** */

export async function revokeMembershipInvitationRecord(
  invitationId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const invitation = await findLockedInvitation(
      transaction,
      invitationId,
    );

    if (invitation.acceptedAt) {
      throw invitationAlreadyAccepted();
    }

    if (invitation.revokedAt) {
      throw new AppError(
        409,
        "Membership invitation has already been revoked.",
        {
          code: "MEMBERSHIP_INVITATION_ALREADY_REVOKED",
        },
      );
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new AppError(410, "Membership invitation has expired.", {
        code: "MEMBERSHIP_INVITATION_EXPIRED",
      });
    }

    return transaction.membershipInvitation.update({
      where: {
        id: invitationId,
        organizationId: invitation.organizationId,
      },

      data: {
        revokedAt: new Date(),
      },
    });
  });
}

//************************************************************** */

export async function refreshMembershipInvitationRecord(
  invitationId: string,
  tokenHash: string,
  expiresAt: Date,
) {
  return prisma.$transaction(async (transaction) => {
    const invitation = await findLockedInvitation(
      transaction,
      invitationId,
    );

    if (invitation.acceptedAt) {
      throw invitationAlreadyAccepted();
    }

    await assertInvitationTargetAvailable(
      transaction,
      invitation.organizationId,
      invitation.email,
      invitation.id,
    );

    await assertOrganizationUserCapacity(
      transaction,
      invitation.organizationId,
      {
        excludeInvitationId: invitation.id,
      },
    );

    return transaction.membershipInvitation.update({
      where: {
        id: invitationId,
        organizationId: invitation.organizationId,
      },

      data: {
        tokenHash,
        expiresAt,
        revokedAt: null,
        acceptedAt: null,
      },
    });
  });
}

//************************************************************** */

export async function acceptMembershipInvitationRecord(
  invitationId: string,
  organizationId: string,
  userId: string,
  role: MembershipRole,
  permissions: Permission[],
  grantedByMembershipId: string,
  employeeId?: string | null,
) {
  return prisma.$transaction(async (transaction) => {
    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    const invitation =
      await transaction.membershipInvitation.findFirst({
        where: {
          id: invitationId,
          organizationId,
        },
      });

    if (!invitation) {
      throw invitationNotFound();
    }

    if (invitation.acceptedAt) {
      throw invitationAlreadyAccepted();
    }

    if (invitation.revokedAt) {
      throw new AppError(
        410,
        "Membership invitation has been revoked.",
        {
          code: "MEMBERSHIP_INVITATION_REVOKED",
        },
      );
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new AppError(410, "Membership invitation has expired.", {
        code: "MEMBERSHIP_INVITATION_EXPIRED",
      });
    }

    if (
      invitation.role !== role ||
      invitation.invitedByMembershipId !== grantedByMembershipId ||
      invitation.employeeId !== (employeeId ?? null)
    ) {
      throw new AppError(
        409,
        "The invitation changed. Refresh and try again.",
        {
          code: "MEMBERSHIP_INVITATION_STATE_CHANGED",
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

    if (
      !user ||
      user.email.trim().toLowerCase() !==
        invitation.email.trim().toLowerCase()
    ) {
      throw new AppError(
        403,
        "This invitation belongs to another email address.",
        {
          code: "MEMBERSHIP_INVITATION_EMAIL_MISMATCH",
        },
      );
    }

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

    await assertOrganizationUserCapacity(
      transaction,
      organizationId,
      {
        excludeInvitationId: invitation.id,
      },
    );

    const membership = await transaction.membership.create({
      data: {
        organizationId,
        userId,
        role: invitation.role,
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

    if (invitation.employeeId) {
      const linked = await transaction.employee.updateMany({
        where: {
          id: invitation.employeeId,
          organizationId,
          membershipId: null,
        },

        data: {
          membershipId: membership.id,
        },
      });

      if (linked.count !== 1) {
        throw new AppError(
          409,
          "The invitation's employee link is no longer available.",
          {
            code: "EMPLOYEE_MEMBERSHIP_ALREADY_LINKED",
          },
        );
      }
    }

    await transaction.membershipInvitation.update({
      where: {
        id: invitationId,
        organizationId,
      },

      data: {
        acceptedAt: new Date(),
      },
    });

    return membership;
  });
}

//************************************************************** */