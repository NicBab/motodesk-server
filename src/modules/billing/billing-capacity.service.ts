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

function capacityReconciliationRequired(): AppError {
  return new AppError(
    409,
    "The organization's user-capacity change requires reconciliation.",
    {
      code: "BILLING_CAPACITY_RECONCILIATION_REQUIRED",
    },
  );
}

function organizationNotFound(): AppError {
  return new AppError(404, "Organization not found.", {
    code: "ORGANIZATION_NOT_FOUND",
  });
}

//************************************************************** */

// Locking does not authorize an operation or require active status.
// Background billing reconciliation must also handle archived
// organizations that still have Stripe billing events.
//
// Always acquire organization and billing locks in this order.
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
      FOR UPDATE
    `,
  );

  if (organizations.length !== 1) {
    throw organizationNotFound();
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

// Internal capacity guard, not an authorization check.
//
// Use the same transaction for this check and the membership or
// invitation write. Exclusions are internal reservation replacements.
export async function assertOrganizationUserCapacity(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  options: CapacityOptions = {},
): Promise<OrganizationUserCapacity> {
  await lockOrganizationUserCapacity(
    transaction,
    organizationId,
  );

  const organization = await transaction.organization.findUnique({
    where: {
      id: organizationId,
    },

    select: {
      status: true,
    },
  });

  if (organization?.status !== OrganizationStatus.ACTIVE) {
    throw organizationNotFound();
  }

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

  const billing =
    await transaction.organizationBilling.findUnique({
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

  let userLimit = plan.usersIncluded + quantity;

  if (billing.activeUserCapacityChangeId) {
    const change =
      await transaction.billingUserCapacityChange.findFirst({
        where: {
          id: billing.activeUserCapacityChangeId,
          organizationBillingId: billing.id,
        },
      });

    if (
      !change ||
      plan.id !== "pro" ||
      change.stripeCustomerId !== billing.stripeCustomerId ||
      change.stripeSubscriptionId !==
        billing.stripeSubscriptionId ||
      (
        change.status !== "PROCESSING" &&
        change.status !== "PENDING_PAYMENT" &&
        change.status !== "RECONCILIATION_REQUIRED"
      ) ||
      !Number.isSafeInteger(change.targetAdditionalUserQuantity) ||
      change.targetAdditionalUserQuantity < 0 ||
      change.targetAdditionalUserQuantity > 2_147_483_647
    ) {
      throw capacityReconciliationRequired();
    }

    // Reductions reserve the lower limit immediately.
    // Increases require synchronized purchased capacity.
    userLimit = Math.min(
      userLimit,
      plan.usersIncluded + change.targetAdditionalUserQuantity,
    );
  }

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