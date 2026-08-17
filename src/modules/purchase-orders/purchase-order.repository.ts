import {
  prisma,
} from "../../config/prisma.js";

import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQueryInput,
  UpdatePurchaseOrderInput,
} from "./purchase-order.schemas.js";

//************************************************************** */

export interface PurchaseOrderLineSnapshot {
  partId: string;

  repairOrderPartLineId?: string;

  partNumber: string;
  description: string;

  orderedQty: number;
  unitCost: number;
}

//************************************************************** */

export async function createPurchaseOrderRecord(
  organizationId: string,
  input: CreatePurchaseOrderInput,
  lines: PurchaseOrderLineSnapshot[],
) {
  return prisma.$transaction(
    async (transaction) => {
      const sequence =
        await transaction.purchaseOrderSequence.upsert({
          where: {
            organizationId,
          },

          update: {
            nextNumber: {
              increment: 1,
            },
          },

          create: {
            organizationId,
            nextNumber: 1002,
          },
        });

      const poNumber =
        sequence.nextNumber - 1;

      return transaction.purchaseOrder.create({
        data: {
          organizationId,

          vendorId:
            input.vendorId,

          poNumber,

          status:
            "DRAFT",

          expectedAt:
            input.expectedAt ??
            null,

          vendorReference:
            input.vendorReference ??
            null,

          shippingCost:
            input.shippingCost,

          taxAmount:
            input.taxAmount,

          notes:
            input.notes ??
            null,

          lines: {
            create:
              lines.map(
                (line) => ({
                  partId:
                    line.partId,

                  repairOrderPartLineId:
                    line.repairOrderPartLineId ??
                    null,

                  partNumber:
                    line.partNumber,

                  description:
                    line.description,

                  orderedQty:
                    line.orderedQty,

                  receivedQty:
                    0,

                  unitCost:
                    line.unitCost,
                }),
              ),
          },
        },

        include: {
          vendor: true,

          lines: {
            include: {
              part: true,
              repairOrderPartLine:
                true,
            },

            orderBy: {
              createdAt:
                "asc",
            },
          },
        },
      });
    },
  );
}

//************************************************************** */

export async function findPurchaseOrderById(
  organizationId: string,
  purchaseOrderId: string,
) {
  return prisma.purchaseOrder.findFirst({
    where: {
      id:
        purchaseOrderId,
      organizationId,
    },

    include: {
      vendor: true,

      lines: {
        include: {
          part: true,
          repairOrderPartLine:
            true,
        },

        orderBy: {
          createdAt:
            "asc",
        },
      },
    },
  });
}

//************************************************************** */

export async function findPurchaseOrdersByOrganization(
  organizationId: string,
  query: ListPurchaseOrdersQueryInput,
) {
  return prisma.purchaseOrder.findMany({
    where: {
      organizationId,

      ...(query.vendorId !== undefined
        ? {
            vendorId:
              query.vendorId,
          }
        : {}),

      ...(query.status !== undefined
        ? {
            status:
              query.status,
          }
        : {}),

      ...(query.isActive !== undefined
        ? {
            isActive:
              query.isActive,
          }
        : {}),

      ...(query.search !== undefined
        ? {
            OR: [
              {
                vendorReference: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },

              {
                notes: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },

              {
                vendor: {
                  name: {
                    contains:
                      query.search,
                    mode:
                      "insensitive",
                  },
                },
              },

              {
                lines: {
                  some: {
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
                        description: {
                          contains:
                            query.search,
                          mode:
                            "insensitive",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },

    include: {
      vendor: true,

      lines: {
        include: {
          part: true,
          repairOrderPartLine:
            true,
        },
      },
    },

    orderBy: {
      createdAt:
        "desc",
    },
  });
}

//************************************************************** */

export async function updatePurchaseOrderRecord(
  organizationId: string,
  purchaseOrderId: string,
  input: UpdatePurchaseOrderInput,
) {
  return prisma.purchaseOrder.updateMany({
    where: {
      id:
        purchaseOrderId,
      organizationId,
    },

    data: {
      ...(input.vendorId !== undefined
        ? {
            vendorId:
              input.vendorId,
          }
        : {}),

      ...(input.expectedAt !== undefined
        ? {
            expectedAt:
              input.expectedAt,
          }
        : {}),

      ...(input.vendorReference !== undefined
        ? {
            vendorReference:
              input.vendorReference,
          }
        : {}),

      ...(input.shippingCost !== undefined
        ? {
            shippingCost:
              input.shippingCost,
          }
        : {}),

      ...(input.taxAmount !== undefined
        ? {
            taxAmount:
              input.taxAmount,
          }
        : {}),

      ...(input.notes !== undefined
        ? {
            notes:
              input.notes,
          }
        : {}),
    },
  });
}

