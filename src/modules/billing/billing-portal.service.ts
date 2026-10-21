import { env } from "../../config/env.js";

import { getStripeClient } from "../../config/stripe.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  Permissions,
} from "../permissions/permission.constants.js";

import {
  assertOrganizationBillingAccess,
} from "./billing-access.service.js";

import {
  findOrganizationBilling,
} from "./billing.repository.js";

//************************************************************** */

export interface BillingPortalResult {
  url: string;
}

//************************************************************** */

export async function createOrganizationBillingPortal(
  organizationId: string,
  userId: string,
): Promise<BillingPortalResult> {
  await assertOrganizationBillingAccess(
    organizationId,
    userId,
    Permissions.BILLING_UPDATE,
  );

  const billing = await findOrganizationBilling(organizationId);

  if (!billing?.stripeCustomerId) {
    throw new AppError(
      409,
      "This organization does not have a billing account yet.",
      {
        code: "BILLING_CUSTOMER_REQUIRED",
      },
    );
  }

  const stripe = getStripeClient();

  try {
    const customer = await stripe.customers.retrieve(
      billing.stripeCustomerId,
    );

    if (
      customer.deleted ||
      customer.livemode !== (env.STRIPE_MODE === "live") ||
      customer.metadata.organizationId !== organizationId
    ) {
      throw new AppError(
        409,
        "The organization billing account requires review.",
        {
          code: "BILLING_CUSTOMER_MAPPING_INVALID",
        },
      );
    }

    const returnUrl = new URL("/settings", env.CLIENT_URL);
    returnUrl.searchParams.set("billing", "portal");

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl.toString(),
    });

    if (
      session.customer !== customer.id ||
      session.livemode !== (env.STRIPE_MODE === "live") ||
      !session.url
    ) {
      throw new AppError(
        503,
        "The billing portal is currently unavailable.",
        {
          code: "BILLING_PORTAL_RESPONSE_INVALID",
        },
      );
    }

    return {
      url: session.url,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      503,
      "The billing portal is currently unavailable.",
      {
        code: "BILLING_PORTAL_UNAVAILABLE",
      },
    );
  }
}

//************************************************************** */