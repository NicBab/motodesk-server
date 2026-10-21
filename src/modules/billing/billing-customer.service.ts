import { env } from "../../config/env.js";

import { prisma } from "../../config/prisma.js";

import { getStripeClient } from "../../config/stripe.js";

import {
  OrganizationStatus,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  attachStripeCustomerToOrganization,
  ensureOrganizationBilling,
  findOrganizationBilling,
} from "./billing.repository.js";

//************************************************************** */

export async function ensureOrganizationStripeCustomer(
  organizationId: string,
): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },

    select: {
      id: true,
      status: true,
    },
  });

  if (
    !organization ||
    organization.status !== OrganizationStatus.ACTIVE
  ) {
    throw new AppError(404, "Organization not found.", {
      code: "ORGANIZATION_NOT_FOUND",
    });
  }

  const stripe = getStripeClient();

  const billing = await ensureOrganizationBilling(
    organization.id,
  );

  if (billing.stripeCustomerId) {
    const customer = await stripe.customers.retrieve(
      billing.stripeCustomerId,
    );

    if (
      customer.deleted ||
      customer.livemode !== (env.STRIPE_MODE === "live") ||
      customer.metadata.organizationId !== organization.id
    ) {
      throw new AppError(
        409,
        "The organization billing account requires review.",
        {
          code: "BILLING_CUSTOMER_MAPPING_INVALID",
        },
      );
    }

    return customer.id;
  }

  // Keep creation parameters stable across retries.
  // Billing contact details can be collected during checkout.
  const customer = await stripe.customers.create(
    {
      metadata: {
        organizationId: organization.id,
      },
    },
    {
      idempotencyKey:
        `motodesk:${env.STRIPE_MODE}:customer:${organization.id}`,
    },
  );

  if (customer.livemode !== (env.STRIPE_MODE === "live")) {
    throw new AppError(
      503,
      "Billing configuration is invalid.",
      {
        code: "BILLING_CUSTOMER_MODE_INVALID",
      },
    );
  }

  const attached = await attachStripeCustomerToOrganization(
    organization.id,
    customer.id,
  );

  if (attached) {
    return customer.id;
  }

  // Another request may have saved the same customer first.
  const current = await findOrganizationBilling(
    organization.id,
  );

  if (current?.stripeCustomerId === customer.id) {
    return customer.id;
  }

  throw new AppError(
    409,
    "The organization billing account requires review.",
    {
      code: "BILLING_CUSTOMER_MAPPING_CONFLICT",
    },
  );
}

//************************************************************** */