import {
  prisma,
} from "../../config/prisma.js";

import type {
  CreatePartInput,
  ListPartsQueryInput,
  UpdatePartInput,
} from "./part.schemas.js";

//************************************************************** */

export async function createPartRecord(
  organizationId: string,
  input: CreatePartInput,
  createdByMembershipId: string | null,
) {
  return prisma.$transaction(
    async (transaction) => {
      const part =
        await transaction.part.create({
          data: {
            organizationId,

            partNumber:
              input.partNumber,

            oemPartNumber:
              input.oemPartNumber ??
              null,

            alternatePartNumbers:
              input.alternatePartNumbers,

            description:
              input.description,

            brand:
              input.brand ??
              null,

            category:
              input.category ??
              null,

            qtyOnHand:
              input.qtyOnHand,

            qtyAllocated:
              input.qtyAllocated,

            qtyOnOrder:
              input.qtyOnOrder,

            reorderPoint:
              input.reorderPoint,

            costPrice:
              input.costPrice,

            sellPrice:
              input.sellPrice,

            location:
              input.location ??
              null,
          },
        });

      if (input.qtyOnHand > 0) {
        await transaction.partInventoryTransaction.create({
          data: {
            partId:
              part.id,

            type:
              "INITIAL",

            quantity:
              input.qtyOnHand,

            quantityBefore:
              0,

            quantityAfter:
              input.qtyOnHand,

            createdByMembershipId,

            notes:
              "Initial inventory quantity.",
          },
        });
      }

      return part;
    },
  );
}

//************************************************************** */

export async function findPartById(
  organizationId: string,
  partId: string,
) {
  return prisma.part.findFirst({
    where: {
      id:
        partId,
      organizationId,
    },
  });
}

//************************************************************** */

export async function findPartByPartNumber(
  organizationId: string,
  partNumber: string,
) {
  return prisma.part.findFirst({
    where: {
      organizationId,
      partNumber,
    },
  });
}

//************************************************************** */

export async function findPartsByOrganization(
  organizationId: string,
  query: ListPartsQueryInput,
) {
  return prisma.part.findMany({
    where: {
      organizationId,

      ...(query.brand !== undefined
        ? {
            brand:
              query.brand,
          }
        : {}),

      ...(query.category !== undefined
        ? {
            category:
              query.category,
          }
        : {}),

      ...(query.isActive !== undefined
        ? {
            isActive:
              query.isActive,
          }
        : {}),

      ...(query.lowStock === true
        ? {
            qtyOnHand: {
              lte:
                prisma.part.fields.reorderPoint,
            },
          }
        : {}),

      ...(query.search !== undefined
        ? {
            OR: [
              {
                partNumber: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },

              {
                oemPartNumber: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },

              {
                alternatePartNumbers: {
                  has:
                    query.search,
                },
              },

              {
                description: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },

              {
                brand: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },

              {
                category: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
            ],
          }
        : {}),
    },

    orderBy: [
      {
        partNumber:
          "asc",
      },
    ],
  });
}

//************************************************************** */

export async function updatePartRecord(
  organizationId: string,
  partId: string,
  input: UpdatePartInput,
) {
  return prisma.part.updateMany({
    where: {
      id:
        partId,
      organizationId,
    },

    data: {
      ...(input.partNumber !== undefined
        ? {
            partNumber:
              input.partNumber,
          }
        : {}),

      ...(input.oemPartNumber !== undefined
        ? {
            oemPartNumber:
              input.oemPartNumber,
          }
        : {}),

      ...(input.alternatePartNumbers !== undefined
        ? {
            alternatePartNumbers:
              input.alternatePartNumbers,
          }
        : {}),

      ...(input.description !== undefined
        ? {
            description:
              input.description,
          }
        : {}),

      ...(input.brand !== undefined
        ? {
            brand:
              input.brand,
          }
        : {}),

      ...(input.category !== undefined
        ? {
            category:
              input.category,
          }
        : {}),

      ...(input.reorderPoint !== undefined
        ? {
            reorderPoint:
              input.reorderPoint,
          }
        : {}),

      ...(input.costPrice !== undefined
        ? {
            costPrice:
              input.costPrice,
          }
        : {}),

      ...(input.sellPrice !== undefined
        ? {
            sellPrice:
              input.sellPrice,
          }
        : {}),

      ...(input.location !== undefined
        ? {
            location:
              input.location,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function archivePartRecord(
  organizationId: string,
  partId: string,
) {
  return prisma.part.updateMany({
    where: {
      id:
        partId,
      organizationId,
      isActive:
        true,
    },

    data: {
      isActive:
        false,
    },
  });
}