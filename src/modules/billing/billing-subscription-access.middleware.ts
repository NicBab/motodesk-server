
import type {
  NextFunction,
  Response,
} from "express";

import { prisma } from "../../config/prisma.js";

import {
  BillingSubscriptionStatus,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import {
  isOrganizationBillingExempt,
} from "./billing-access.service.js";

//************************************************************** */

export type SubscriptionAccessMode =
  | "FULL"
  | "READ_ONLY";

export interface SubscriptionAccessResult {
  accessMode: SubscriptionAccessMode;
  subscriptionStatus: BillingSubscriptionStatus;
}

const READ_ONLY_METHODS = new Set([
  "GET",
  "HEAD",
]);

//************************************************************** */

export async function resolveSubscriptionAccess(
  organizationId: string,
): Promise<SubscriptionAccessResult> {
  const billingExempt =
    await isOrganizationBillingExempt(
      organizationId,
    );

  if (billingExempt) {
    return {
      accessMode: "FULL",
      subscriptionStatus:
        BillingSubscriptionStatus.NOT_SUBSCRIBED,
    };
  }

  const billing =
    await prisma.organizationBilling.findUnique({
      where: {
        organizationId,
      },
      select: {
        status: true,
        trialEndsAt: true,
        endedAt: true,
      },
    });

  const subscriptionStatus =
    billing?.status ??
    BillingSubscriptionStatus.NOT_SUBSCRIBED;

  let accessMode: SubscriptionAccessMode =
    "READ_ONLY";

  if (billing && billing.endedAt === null) {
    switch (billing.status) {
      case BillingSubscriptionStatus.ACTIVE: {
        accessMode = "FULL";
        break;
      }

      case BillingSubscriptionStatus.TRIALING: {
        if (
          billing.trialEndsAt !== null &&
          billing.trialEndsAt.getTime() > Date.now()
        ) {
          accessMode = "FULL";
        }

        break;
      }

      case BillingSubscriptionStatus.PAST_DUE:
      case BillingSubscriptionStatus.INCOMPLETE:
      case BillingSubscriptionStatus.INCOMPLETE_EXPIRED:
      case BillingSubscriptionStatus.UNPAID:
      case BillingSubscriptionStatus.PAUSED:
      case BillingSubscriptionStatus.CANCELED:
      case BillingSubscriptionStatus.NOT_SUBSCRIBED:
      default: {
        accessMode = "READ_ONLY";
        break;
      }
    }
  }

  return {
    accessMode,
    subscriptionStatus,
  };
}

//************************************************************** */

export function requireSubscriptionOrganization(
  request: AuthenticatedRequest,
): string {
  const organizationId =
    request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(
      400,
      "A valid organization ID is required.",
      {
        code: "ORGANIZATION_ID_REQUIRED",
      },
    );
  }

  const membership =
    request.authenticatedMembership;

  if (
    !membership ||
    membership.organizationId !== organizationId
  ) {
    throw new AppError(
      403,
      "Organization access is required.",
      {
        code: "ORGANIZATION_ACCESS_DENIED",
      },
    );
  }

  return organizationId;
}

//************************************************************** */

export async function requireSubscriptionAccess(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId =
      requireSubscriptionOrganization(request);

    const {
      accessMode,
      subscriptionStatus,
    } = await resolveSubscriptionAccess(
      organizationId,
    );

    if (accessMode === "FULL") {
      next();
      return;
    }

    if (
      READ_ONLY_METHODS.has(request.method)
    ) {
      next();
      return;
    }

    throw new AppError(
      403,
      "Your subscription requires attention. Business changes are temporarily restricted.",
      {
        code: "SUBSCRIPTION_ACCESS_RESTRICTED",
        details: {
          subscriptionStatus,
          accessMode: "READ_ONLY",
          billingRecoveryAvailable: true,
        },
      },
    );
  } catch (error) {
    next(error);
  }
}

//************************************************************** */
