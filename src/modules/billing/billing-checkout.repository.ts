import { prisma } from "../../config/prisma.js";

import {
  BillingSubscriptionStatus,
} from "../../generated/prisma/client.js";

//************************************************************** */

export async function claimOrganizationCheckout(
  organizationId: string,
  stripeCustomerId: string,
  operationId: string,
): Promise<boolean> {
  const result = await prisma.organizationBilling.updateMany({
    where: {
      organizationId,

      stripeCustomerId,

      status: {
        in: [
          BillingSubscriptionStatus.NOT_SUBSCRIBED,
          BillingSubscriptionStatus.CANCELED,
          BillingSubscriptionStatus.INCOMPLETE_EXPIRED,
        ],
      },

      checkoutOperationId: null,
      checkoutSessionId: null,
      checkoutSessionExpiresAt: null,
    },

    data: {
      checkoutOperationId: operationId,
    },
  });

  return result.count === 1;
}

//************************************************************** */

export async function saveOrganizationCheckoutSession(
  organizationId: string,
  operationId: string,
  stripeCustomerId: string,
  checkoutSessionId: string,
  expiresAt: Date,
): Promise<boolean> {
  const result = await prisma.organizationBilling.updateMany({
    where: {
      organizationId,

      stripeCustomerId,

      checkoutOperationId: operationId,
      checkoutSessionId: null,
    },

    data: {
      checkoutSessionId,
      checkoutSessionExpiresAt: expiresAt,
    },
  });

  return result.count === 1;
}

//************************************************************** */

export async function clearExpiredOrganizationCheckout(
  organizationId: string,
  operationId: string,
  checkoutSessionId: string,
): Promise<boolean> {
  const result = await prisma.organizationBilling.updateMany({
    where: {
      organizationId,

      checkoutOperationId: operationId,
      checkoutSessionId,

      checkoutSessionExpiresAt: {
        lte: new Date(),
      },

      status: {
        in: [
          BillingSubscriptionStatus.NOT_SUBSCRIBED,
          BillingSubscriptionStatus.CANCELED,
          BillingSubscriptionStatus.INCOMPLETE_EXPIRED,
        ],
      },
    },

    data: {
      checkoutOperationId: null,
      checkoutSessionId: null,
      checkoutSessionExpiresAt: null,
    },
  });

  return result.count === 1;
}

//************************************************************** */