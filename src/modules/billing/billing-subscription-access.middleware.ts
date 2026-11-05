
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

const READ_ONLY_METHODS = new Set([
  "GET",
  "HEAD",
]);

//************************************************************** */

export async function requireSubscriptionAccess(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = request.params.organizationId;

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

    // Authorization must be established before checking
    // billing status or exemption.

    const membership = request.authenticatedMembership;

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

    // Preserve the existing platform-admin owner
    // exemption policy.

    const billingExempt =
      await isOrganizationBillingExempt(organizationId);

    if (billingExempt) {
      next();
      return;
    }

    const billing =
      await prisma.organizationBilling.findUnique({
        where: {
          organizationId,
        },
        select: {
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          endedAt: true,
        },
      });

    const now = Date.now();

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
            billing.trialEndsAt.getTime() > now
          ) {
            accessMode = "FULL";
          }
          break;
        }

        // Past-due grace requires an authoritative
        // delinquency timestamp. Until implemented,
        // use the conservative read-only fallback.

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

    if (accessMode === "FULL") {
      next();
      return;
    }

    // Only safe read endpoints may pass this guard.
    // Routes with GET side effects must be excluded
    // or explicitly restricted during integration.

    if (READ_ONLY_METHODS.has(request.method)) {
      next();
      return;
    }

    throw new AppError(
      403,
      "Your subscription requires attention. Business changes are temporarily restricted.",
      {
        code: "SUBSCRIPTION_ACCESS_RESTRICTED",
        details: {
          subscriptionStatus:
            billing?.status ??
            BillingSubscriptionStatus.NOT_SUBSCRIBED,
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
