import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  getBillingPlan,
  isBillingPlanId,
} from "./billing.constants.js";

//************************************************************** */

interface CapacityOptions {
  // Internal callers must validate these records in the same
  // transaction. These options are never accepted from request data.
  excludeInvitationId?: string;
  excludeMembershipId?: string;
}

export interface OrganizationUserCapacity {
  billingExempt: boolean;
  userLimit: number | null;
  assignedUsers: number;
  reservedMemberships: number;
  pendingInvitations: number;
}

//************************************************************** */

function invalidBillingConfiguration(): AppError {
  return new AppError(
    503,
    "The organization billing configuration requires review.",
    {
      code: "BILLING_PLAN_CONFIGURATION_INVALID",
    },
  );
}

//************************************************************** */

// Always acquire these locks in organization-then-billing order.
// Locks remain held until the caller's transaction finishes.
export async function lockOrganizationUserCapacity(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const organizations = await transaction.$queryRaw<
    { id: string }[]
  >(
    Prisma.sql`
      SELECT "id"
      FROM "Organization"
      WHERE "id" = ${organizationId}
        AND "status" = 'ACTIVE'
      FOR UPDATE
    `,
  );

  if (organizations.length !== 1) {
    throw new AppError(404, "Organization not found.", {
      code: "ORGANIZATION_NOT_FOUND",
    });
  }

  await transaction.$queryRaw(
    Prisma.sql`
      SELECT "id"
      FROM "OrganizationBilling"
      WHERE "organizationId" = ${organizationId}
      FOR UPDATE
    `,
  );
}

//************************************************************** */

// Internal write guard, not an authorization check.
//
// Use the same transaction for this check and the corresponding
// membership or invitation write. Excluded records represent
// reservations being replaced by that write.
export async function assertOrganizationUserCapacity(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  options: CapacityOptions = {},
): Promise<OrganizationUserCapacity> {
  await lockOrganizationUserCapacity(
    transaction,
    organizationId,
  );

  const exemptOwner = await transaction.membership.findFirst({
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

  const membershipExclusion = options.excludeMembershipId
    ? {
        id: {
          not: options.excludeMembershipId,
        },
      }
    : {};

  const assignedUsers = await transaction.membership.count({
    where: {
      organizationId,
      status: MembershipStatus.ACTIVE,
      ...membershipExclusion,
    },
  });

  const reservedMemberships = await transaction.membership.count({
    where: {
      organizationId,
      status: MembershipStatus.INVITED,
      ...membershipExclusion,
    },
  });

  const pendingInvitations =
    await transaction.membershipInvitation.count({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,

        expiresAt: {
          gt: new Date(),
        },

        ...(options.excludeInvitationId
          ? {
              id: {
                not: options.excludeInvitationId,
              },
            }
          : {}),
      },
    });

  if (exemptOwner) {
    return {
      billingExempt: true,
      userLimit: null,
      assignedUsers,
      reservedMemberships,
      pendingInvitations,
    };
  }

  const billing = await transaction.organizationBilling.findUnique({
    where: {
      organizationId,
    },
  });

  if (
    !billing ||
    (
      billing.status !== "TRIALING" &&
      billing.status !== "ACTIVE"
    )
  ) {
    throw new AppError(
      409,
      "An active subscription or trial is required to add application users.",
      {
        code: "BILLING_SUBSCRIPTION_REQUIRED",
      },
    );
  }

  if (!isBillingPlanId(billing.planId)) {
    throw invalidBillingConfiguration();
  }

  const plan = getBillingPlan(billing.planId);
  const quantity = billing.additionalUserQuantity;

  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    quantity > 2_147_483_647
  ) {
    throw invalidBillingConfiguration();
  }

  if (quantity > 0) {
    if (
      !plan.additionalUserPricing ||
      billing.additionalUserUnitAmount !==
        plan.additionalUserPricing.unitAmount ||
      !billing.stripeAdditionalUserPriceId ||
      !billing.stripeAdditionalUserItemId
    ) {
      throw invalidBillingConfiguration();
    }
  } else if (
    billing.additionalUserUnitAmount !== null ||
    billing.stripeAdditionalUserPriceId !== null ||
    billing.stripeAdditionalUserItemId !== null
  ) {
    throw invalidBillingConfiguration();
  }

  const userLimit = plan.usersIncluded + quantity;

  const usedCapacity =
    assignedUsers +
    reservedMemberships +
    pendingInvitations;

  if (usedCapacity + 1 > userLimit) {
    throw new AppError(
      409,
      "Your organization has no available user slots. Review your plan and user capacity in Billing.",
      {
        code: "BILLING_USER_LIMIT_REACHED",

        details: {
          userLimit,
          assignedUsers,
          reservedMemberships,
          pendingInvitations,
        },
      },
    );
  }

  return {
    billingExempt: false,
    userLimit,
    assignedUsers,
    reservedMemberships,
    pendingInvitations,
  };
}

//************************************************************** */