import {
  prisma,
} from "../../config/prisma.js";

import type {
  CreateCustomerInput,
  ListCustomersQueryInput,
  UpdateCustomerInput,
} from "./customer.schemas.js";

//************************************************************** */

export async function createCustomerRecord(
  organizationId: string,
  input: CreateCustomerInput,
) {
  return prisma.customer.create({
    data: {
      organizationId,
      type: input.type,

      firstName:
        input.firstName ?? null,
      lastName:
        input.lastName ?? null,
      companyName:
        input.companyName ?? null,

      email:
        input.email ?? null,
      phone:
        input.phone ?? null,
      alternatePhone:
        input.alternatePhone ?? null,

      addressLine1:
        input.addressLine1 ?? null,
      addressLine2:
        input.addressLine2 ?? null,
      city:
        input.city ?? null,
      state:
        input.state ?? null,
      postalCode:
        input.postalCode ?? null,
      country:
        input.country ?? null,

      notes:
        input.notes ?? null,
    },
  });
}

//************************************************************** */

export async function findCustomerById(
  organizationId: string,
  customerId: string,
) {
  return prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
    },
  });
}

//************************************************************** */

export async function findCustomersByOrganization(
  organizationId: string,
  query: ListCustomersQueryInput,
) {
  return prisma.customer.findMany({
    where: {
      organizationId,

      ...(query.isActive !== undefined
        ? {
            isActive:
              query.isActive,
          }
        : {}),

      ...(query.type !== undefined
        ? {
            type:
              query.type,
          }
        : {}),

      ...(query.search !== undefined
        ? {
            OR: [
              {
                firstName: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
              {
                lastName: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
              {
                companyName: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
              {
                email: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
              {
                phone: {
                  contains:
                    query.search,
                },
              },
              {
                alternatePhone: {
                  contains:
                    query.search,
                },
              },
            ],
          }
        : {}),
    },

    orderBy: [
      {
        lastName: "asc",
      },
      {
        firstName: "asc",
      },
      {
        companyName: "asc",
      },
    ],
  });
}
//************************************************************** */

export async function updateCustomerRecord(
  organizationId: string,
  customerId: string,
  input: UpdateCustomerInput,
) {
  return prisma.customer.updateMany({
    where: {
      id: customerId,
      organizationId,
    },

    data: {
      ...(input.type !== undefined
        ? { type: input.type }
        : {}),

      ...(input.firstName !== undefined
        ? { firstName: input.firstName }
        : {}),

      ...(input.lastName !== undefined
        ? { lastName: input.lastName }
        : {}),

      ...(input.companyName !== undefined
        ? { companyName: input.companyName }
        : {}),

      ...(input.email !== undefined
        ? { email: input.email }
        : {}),

      ...(input.phone !== undefined
        ? { phone: input.phone }
        : {}),

      ...(input.alternatePhone !== undefined
        ? { alternatePhone: input.alternatePhone }
        : {}),

      ...(input.addressLine1 !== undefined
        ? { addressLine1: input.addressLine1 }
        : {}),

      ...(input.addressLine2 !== undefined
        ? { addressLine2: input.addressLine2 }
        : {}),

      ...(input.city !== undefined
        ? { city: input.city }
        : {}),

      ...(input.state !== undefined
        ? { state: input.state }
        : {}),

      ...(input.postalCode !== undefined
        ? { postalCode: input.postalCode }
        : {}),

      ...(input.country !== undefined
        ? { country: input.country }
        : {}),

      ...(input.notes !== undefined
        ? { notes: input.notes }
        : {}),
    },
  });
}

//************************************************************** */

export async function archiveCustomerRecord(
  organizationId: string,
  customerId: string,
) {
  return prisma.customer.updateMany({
    where: {
      id: customerId,
      organizationId,
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });
}