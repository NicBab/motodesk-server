import { prisma } from "../../config/prisma.js";

import type {
  CreateVendorInput,
  ListVendorsQueryInput,
  UpdateVendorInput,
} from "./vendor.schemas.js";

//************************************************************** */

export async function createVendorRecord(
  organizationId: string,
  input: CreateVendorInput,
) {
  return prisma.vendor.create({
    data: {
      organizationId,

      name: input.name,

      accountNumber: input.accountNumber ?? null,

      email: input.email ?? null,

      phone: input.phone ?? null,

      website: input.website ?? null,

      addressLine1: input.addressLine1 ?? null,

      addressLine2: input.addressLine2 ?? null,

      city: input.city ?? null,

      state: input.state ?? null,

      postalCode: input.postalCode ?? null,

      country: input.country ?? null,

      contactName: input.contactName ?? null,

      contactEmail: input.contactEmail ?? null,

      contactPhone: input.contactPhone ?? null,

      notes: input.notes ?? null,
    },
  });
}

//************************************************************** */

export async function findVendorById(organizationId: string, vendorId: string) {
  return prisma.vendor.findFirst({
    where: {
      id: vendorId,

      organizationId,
    },
  });
}

//************************************************************** */

export async function findVendorByName(organizationId: string, name: string) {
  return prisma.vendor.findFirst({
    where: {
      organizationId,
      name,
    },
  });
}

//************************************************************** */

export async function findVendorsByOrganization(
  organizationId: string,
  query: ListVendorsQueryInput,
) {
  return prisma.vendor.findMany({
    where: {
      organizationId,

      ...(query.isActive !== undefined
        ? {
            isActive: query.isActive,
          }
        : {}),

      ...(query.search !== undefined
        ? {
            OR: [
              {
                name: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                accountNumber: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                email: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                phone: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                contactName: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },

    orderBy: {
      name: "asc",
    },
  });
}

//************************************************************** */

export async function updateVendorRecord(
  organizationId: string,
  vendorId: string,
  input: UpdateVendorInput,
) {
  return prisma.vendor.updateMany({
    where: {
      id: vendorId,

      organizationId,
    },

    data: {
      ...(input.name !== undefined
        ? {
            name: input.name,
          }
        : {}),

      ...(input.accountNumber !== undefined
        ? {
            accountNumber: input.accountNumber,
          }
        : {}),

      ...(input.email !== undefined
        ? {
            email: input.email,
          }
        : {}),

      ...(input.phone !== undefined
        ? {
            phone: input.phone,
          }
        : {}),

      ...(input.website !== undefined
        ? {
            website: input.website,
          }
        : {}),

      ...(input.addressLine1 !== undefined
        ? {
            addressLine1: input.addressLine1,
          }
        : {}),

      ...(input.addressLine2 !== undefined
        ? {
            addressLine2: input.addressLine2,
          }
        : {}),

      ...(input.city !== undefined
        ? {
            city: input.city,
          }
        : {}),

      ...(input.state !== undefined
        ? {
            state: input.state,
          }
        : {}),

      ...(input.postalCode !== undefined
        ? {
            postalCode: input.postalCode,
          }
        : {}),

      ...(input.country !== undefined
        ? {
            country: input.country,
          }
        : {}),

      ...(input.contactName !== undefined
        ? {
            contactName: input.contactName,
          }
        : {}),

      ...(input.contactEmail !== undefined
        ? {
            contactEmail: input.contactEmail,
          }
        : {}),

      ...(input.contactPhone !== undefined
        ? {
            contactPhone: input.contactPhone,
          }
        : {}),

      ...(input.notes !== undefined
        ? {
            notes: input.notes,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function archiveVendorRecord(
  organizationId: string,
  vendorId: string,
) {
  return prisma.vendor.updateMany({
    where: {
      id: vendorId,

      organizationId,

      isActive: true,
    },

    data: {
      isActive: false,
    },
  });
}

//************************************************************** */

export async function restoreVendorRecord(
  organizationId: string,
  vendorId: string,
) {
  return prisma.vendor.updateMany({
    where: {
      id: vendorId,

      organizationId,

      isActive: false,
    },

    data: {
      isActive: true,
    },
  });
}
