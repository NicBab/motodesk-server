import { prisma } from "../../config/prisma.js";

import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  Permissions,
  type Permission,
} from "../permissions/permission.constants.js";

import {
  findMembershipPermissions,
} from "../permissions/permission.repository.js";

import {
  getEffectivePermissions,
} from "../permissions/permission.utils.js";

//************************************************************** */

type BillingPermission =
  | typeof Permissions.BILLING_VIEW
  | typeof Permissions.BILLING_UPDATE;

export interface OrganizationBillingAccess {
  membershipId: string;
  organizationId: string;
  userId: string;
}

//************************************************************** */

export async function assertOrganizationBillingAccess(
  organizationId: string,
  userId: string,
  requiredPermission: BillingPermission,
): Promise<OrganizationBillingAccess> {
  const membership = await prisma.membership.findFirst({
    where: {
      organizationId,
      userId,
      status: MembershipStatus.ACTIVE,

      organization: {
        status: OrganizationStatus.ACTIVE,
      },

      user: {
        isActive: true,
      },
    },

    select: {
      id: true,
      organizationId: true,
      userId: true,
      role: true,

      user: {
        select: {
          emailVerifiedAt: true,
        },
      },
    },
  });

  if (!membership) {
    throw new AppError(404, "Organization not found.", {
      code: "ORGANIZATION_NOT_FOUND",
    });
  }

  if (!membership.user.emailVerifiedAt) {
    throw new AppError(
      403,
      "Email verification is required to manage billing.",
      {
        code: "BILLING_EMAIL_VERIFICATION_REQUIRED",
      },
    );
  }

  const storedPermissions =
    membership.role === MembershipRole.OWNER
      ? []
      : await findMembershipPermissions(
          organizationId,
          membership.id,
        );

  const effectivePermissions = getEffectivePermissions(
    membership.role,
    storedPermissions.map(
      (record) => record.permission as Permission,
    ),
  );

  if (!effectivePermissions.includes(requiredPermission)) {
    throw new AppError(
      403,
      "You do not have permission to perform this action.",
      {
        code: "INSUFFICIENT_PERMISSIONS",

        details: {
          missingPermissions: [requiredPermission],
        },
      },
    );
  }

  return {
    membershipId: membership.id,
    organizationId: membership.organizationId,
    userId: membership.userId,
  };
}

//************************************************************** */

export async function isOrganizationBillingExempt(
  organizationId: string,
): Promise<boolean> {
  const owner = await prisma.membership.findFirst({
    where: {
      organizationId,

      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,

      organization: {
        status: OrganizationStatus.ACTIVE,
      },

      user: {
        isActive: true,

        emailVerifiedAt: {
          not: null,
        },

        platformAdmin: {
          is: {
            isActive: true,
            billingExempt: true,
          },
        },
      },
    },

    select: {
      id: true,
    },
  });

  return owner !== null;
}

//************************************************************** */