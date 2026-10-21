import { prisma } from "../../config/prisma.js";

//************************************************************** */

export async function findOrganizationBilling(
  organizationId: string,
) {
  return prisma.organizationBilling.findUnique({
    where: {
      organizationId,
    },
  });
}

//************************************************************** */

export async function ensureOrganizationBilling(
  organizationId: string,
) {
  return prisma.organizationBilling.upsert({
    where: {
      organizationId,
    },

    create: {
      organizationId,
    },

    update: {},
  });
}

//************************************************************** */

export async function attachStripeCustomerToOrganization(
  organizationId: string,
  stripeCustomerId: string,
): Promise<boolean> {
  const result = await prisma.organizationBilling.updateMany({
    where: {
      organizationId,

      stripeCustomerId: null,
    },

    data: {
      stripeCustomerId,
    },
  });

  return result.count === 1;
}

//************************************************************** */