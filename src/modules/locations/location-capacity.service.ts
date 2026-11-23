
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
} from "../billing/billing.constants.js";

import {
  lockOrganizationUserCapacity,
} from "../billing/billing-capacity.service.js";

//************************************************************** */

export interface OrganizationLocationCapacity {
  billingExempt: boolean;
  locationLimit: number | null;
  activeLocations: number;
  availableLocations: number | null;
}

//************************************************************** */

// Internal capacity guard, not an authorization check.
//
// Must execute in the same transaction as the location write.
// Organization and billing locks must be acquired first.
export async function assertOrganizationLocationCapacity(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<OrganizationLocationCapacity> {
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
    throw new AppError(404, "Organization not found.", {
      code: "ORGANIZATION_NOT_FOUND",
    });
  }

  const activeLocations = await transaction.shopLocation.count({
    where: {
      organizationId,
      status: "ACTIVE",
    },
  });

  const exemptOwner = await transaction.membership.findFirst({
    where: {
      organizationId,
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,

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

  if (exemptOwner) {
    return {
      billingExempt: true,
      locationLimit: null,
      activeLocations,
      availableLocations: null,
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
      billing.status !== "ACTIVE" &&
      billing.status !== "TRIALING"
    )
  ) {
    throw new AppError(
      409,
      "An active subscription or trial is required to create locations.",
      {
        code: "BILLING_SUBSCRIPTION_REQUIRED",
      },
    );
  }

  if (!isBillingPlanId(billing.planId)) {
    throw new AppError(
      503,
      "The organization billing configuration requires review.",
      {
        code: "BILLING_PLAN_CONFIGURATION_INVALID",
      },
    );
  }

  if (
    billing.activePlanChangeId ||
    billing.activeUserCapacityChangeId
  ) {
    throw new AppError(
      409,
      "A billing change is in progress. Try again after it completes.",
      {
        code: "BILLING_CHANGE_IN_PROGRESS",
      },
    );
  }

  const plan = getBillingPlan(billing.planId);
  const additionalQuantity = billing.additionalLocationQuantity;

  if (
    !Number.isSafeInteger(additionalQuantity) ||
    additionalQuantity < 0
  ) {
    throw new AppError(
      503,
      "Additional-location billing configuration is invalid.",
      {
        code: "BILLING_LOCATION_CONFIGURATION_INVALID",
      },
    );
  }

  if (additionalQuantity > 0) {
    if (
      !plan.additionalLocationPricing ||
      billing.additionalLocationUnitAmount !==
        plan.additionalLocationPricing.unitAmount ||
      !billing.stripeAdditionalLocationPriceId ||
      !billing.stripeAdditionalLocationItemId
    ) {
      throw new AppError(
        503,
        "Additional-location billing requires reconciliation.",
        {
          code: "BILLING_LOCATION_RECONCILIATION_REQUIRED",
        },
      );
    }
  } else if (
    billing.additionalLocationUnitAmount !== null ||
    billing.stripeAdditionalLocationPriceId !== null ||
    billing.stripeAdditionalLocationItemId !== null
  ) {
    throw new AppError(
      503,
      "Additional-location billing requires reconciliation.",
      {
        code: "BILLING_LOCATION_RECONCILIATION_REQUIRED",
      },
    );
  }

  const locationLimit =
    plan.locationsIncluded + additionalQuantity;

  if (!Number.isSafeInteger(locationLimit)) {
    throw new AppError(
      503,
      "Location capacity is invalid.",
      {
        code: "BILLING_LOCATION_CONFIGURATION_INVALID",
      },
    );
  }

  const availableLocations = Math.max(
    0,
    locationLimit - activeLocations,
  );

  if (availableLocations === 0) {
    throw new AppError(
      409,
      plan.additionalLocationPricing
        ? "Additional location capacity must be purchased before creating another location."
        : "Your subscription does not support additional locations.",
      {
        code: "BILLING_LOCATION_CAPACITY_EXCEEDED",
      },
    );
  }

  return {
    billingExempt: false,
    locationLimit,
    activeLocations,
    availableLocations,
  };
}

//************************************************************** */
