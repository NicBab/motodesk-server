import { prisma } from "../../config/prisma.js";

import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQueryInput,
  UpdatePurchaseOrderInput,
  ReceivePurchaseOrderLineInput,
} from "./purchase-order.schemas.js";

import { PartInventoryTransactionType } from "../../generated/prisma/client.js";

import { applyInventoryMutationWithTransaction } from "../parts/part-inventory.repository.js";

//************************************************************** */

export interface PurchaseOrderLineSnapshot {
  partId?: string;

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
  return prisma.$transaction(async (transaction) => {
    const sequence = await transaction.purchaseOrderSequence.upsert({
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

    const poNumber = sequence.nextNumber - 1;

    return transaction.purchaseOrder.create({
      data: {
        organizationId,

        vendorId: input.vendorId,

        poNumber,

        status: "DRAFT",

        expectedAt: input.expectedAt ?? null,

        vendorReference: input.vendorReference ?? null,

        shippingCost: input.shippingCost,

        taxAmount: input.taxAmount,

        notes: input.notes ?? null,

        lines: {
          create: lines.map((line) => ({
            partId: line.partId ?? null,

            repairOrderPartLineId: line.repairOrderPartLineId ?? null,

            partNumber: line.partNumber,

            description: line.description,

            orderedQty: line.orderedQty,

            receivedQty: 0,

            unitCost: line.unitCost,
          })),
        },
      },

      include: {
        vendor: true,

        lines: {
          include: {
            part: true,
            repairOrderPartLine: true,
          },

          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });
  });
}

//************************************************************** */

export async function findPurchaseOrderById(
  organizationId: string,
  purchaseOrderId: string,
) {
  return prisma.purchaseOrder.findFirst({
    where: {
      id: purchaseOrderId,

      organizationId,
    },

    include: {
      vendor: true,

      lines: {
        include: {
          part: true,
          repairOrderPartLine: true,
        },

        orderBy: {
          createdAt: "asc",
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
            vendorId: query.vendorId,
          }
        : {}),

      ...(query.status !== undefined
        ? {
            status: query.status,
          }
        : {}),

      ...(query.isActive !== undefined
        ? {
            isActive: query.isActive,
          }
        : {}),

      ...(query.search !== undefined
        ? {
            OR: [
              {
                vendorReference: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                notes: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                vendor: {
                  name: {
                    contains: query.search,

                    mode: "insensitive",
                  },
                },
              },

              {
                lines: {
                  some: {
                    OR: [
                      {
                        partNumber: {
                          contains: query.search,

                          mode: "insensitive",
                        },
                      },

                      {
                        description: {
                          contains: query.search,

                          mode: "insensitive",
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
          repairOrderPartLine: true,
        },

        orderBy: {
          createdAt: "asc",
        },
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });
}

//************************************************************** */

export async function orderPurchaseOrderRecord(
  organizationId: string,
  purchaseOrderId: string,
  createdByMembershipId: string | null,
) {
  return prisma.$transaction(async (transaction) => {
    const purchaseOrder = await transaction.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,

        organizationId,
      },

      include: {
        lines: true,
      },
    });

    if (!purchaseOrder) {
      return null;
    }

    if (purchaseOrder.status !== "DRAFT") {
      return {
        purchaseOrder,
        alreadyOrdered: true,
      };
    }

    for (const line of purchaseOrder.lines) {
      const orderedQty = Number(line.orderedQty.toString());

      // Manual PO lines intentionally do not affect inventory.
      if (line.partId) {
        const inventoryResult = await applyInventoryMutationWithTransaction(
          transaction,
          {
            partId: line.partId,

            type: PartInventoryTransactionType.PURCHASE_ORDERED,

            quantity: orderedQty,

            onOrderDelta: orderedQty,

            referenceType: "PURCHASE_ORDER",

            referenceId: purchaseOrder.id,

            createdByMembershipId,
          },
        );

        if (!inventoryResult) {
          return {
            purchaseOrder,
            inventoryFailed: true,
          };
        }
      }

      if (line.repairOrderPartLineId) {
        const repairOrderPartLine =
          await transaction.repairOrderPartLine.findUnique({
            where: {
              id: line.repairOrderPartLineId,
            },
          });

        if (repairOrderPartLine) {
          const currentOrderedQty = Number(
            repairOrderPartLine.orderedQty.toString(),
          );

          await transaction.repairOrderPartLine.update({
            where: {
              id: line.repairOrderPartLineId,
            },

            data: {
              orderedQty: currentOrderedQty + orderedQty,

              status: "ORDERED",
            },
          });
        }
      }
    }

    await transaction.purchaseOrder.update({
      where: {
        id: purchaseOrderId,
      },

      data: {
        status: "ORDERED",

        orderedAt: new Date(),
      },
    });

    const updatedPurchaseOrder = await transaction.purchaseOrder.findUnique({
      where: {
        id: purchaseOrderId,
      },

      include: {
        vendor: true,

        lines: {
          include: {
            part: true,

            repairOrderPartLine: true,
          },

          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return {
      purchaseOrder: updatedPurchaseOrder,

      alreadyOrdered: false,

      inventoryFailed: false,
    };
  });
}

//************************************************************** */

export async function receivePurchaseOrderLineRecord(
  organizationId: string,
  purchaseOrderId: string,
  input: ReceivePurchaseOrderLineInput,
  createdByMembershipId: string | null,
) {
  return prisma.$transaction(async (transaction) => {
    const purchaseOrder = await transaction.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,

        organizationId,
      },

      include: {
        lines: true,
      },
    });

    if (!purchaseOrder) {
      return null;
    }

    const line = purchaseOrder.lines.find(
      (item) => item.id === input.purchaseOrderLineId,
    );

    if (!line) {
      return {
        purchaseOrder,

        lineNotFound: true,
      };
    }

    const orderedQty = Number(line.orderedQty.toString());

    const currentReceivedQty = Number(line.receivedQty.toString());

    const remainingQty = orderedQty - currentReceivedQty;

    if (input.quantity > remainingQty) {
      return {
        purchaseOrder,
        line,

        exceedsRemaining: true,

        remainingQty,
      };
    }

    //************************************************************** */
    // Inventory-backed receipt

    if (line.partId) {
      const inventoryResult = await applyInventoryMutationWithTransaction(
        transaction,
        {
          partId: line.partId,

          type: PartInventoryTransactionType.PURCHASE_RECEIPT,

          quantity: input.quantity,

          onHandDelta: input.quantity,

          onOrderDelta: -input.quantity,

          referenceType: "PURCHASE_ORDER",

          referenceId: purchaseOrder.id,

          ...(input.notes !== undefined
            ? {
                notes: input.notes,
              }
            : {}),

          createdByMembershipId,
        },
      );

      if (!inventoryResult) {
        return {
          purchaseOrder,

          inventoryFailed: true,
        };
      }
    }

    //************************************************************** */
    // PO line receiving metadata

    const receivedQty = currentReceivedQty + input.quantity;

    const damagedQty = Number(line.damagedQty.toString()) + input.damagedQty;

    const backorderedQty =
      Number(line.backorderedQty.toString()) + input.backorderedQty;

    await transaction.purchaseOrderLine.update({
      where: {
        id: input.purchaseOrderLineId,
      },

      data: {
        receivedQty,

        damagedQty,

        backorderedQty,

        ...(input.actualCost !== undefined
          ? {
              actualCost: input.actualCost,
            }
          : {}),

        ...(input.invoiceNumber !== undefined
          ? {
              invoiceNumber: input.invoiceNumber,
            }
          : {}),

        ...(input.packingSlip !== undefined
          ? {
              packingSlip: input.packingSlip,
            }
          : {}),

        ...(input.binLocation !== undefined
          ? {
              binLocation: input.binLocation,
            }
          : {}),
      },
    });

    //************************************************************** */
    // Linked RO part line

    if (line.repairOrderPartLineId) {
      const repairOrderPartLine =
        await transaction.repairOrderPartLine.findUnique({
          where: {
            id: line.repairOrderPartLineId,
          },
        });

      if (repairOrderPartLine) {
        const currentRoReceivedQty = Number(
          repairOrderPartLine.receivedQty.toString(),
        );

        const newRoReceivedQty = currentRoReceivedQty + input.quantity;

        const roOrderedQty = Number(repairOrderPartLine.orderedQty.toString());

        const roStatus =
          newRoReceivedQty >= roOrderedQty ? "RECEIVED" : "PARTIALLY_RECEIVED";

        await transaction.repairOrderPartLine.update({
          where: {
            id: line.repairOrderPartLineId,
          },

          data: {
            receivedQty: newRoReceivedQty,

            status: roStatus,
          },
        });
      }
    }

    //************************************************************** */
    // Re-evaluate overall PO receipt status

    const updatedLines = await transaction.purchaseOrderLine.findMany({
      where: {
        purchaseOrderId,
      },
    });

    const allReceived = updatedLines.every(
      (item) =>
        Number(item.receivedQty.toString()) >=
        Number(item.orderedQty.toString()),
    );

    await transaction.purchaseOrder.update({
      where: {
        id: purchaseOrderId,
      },

      data: {
        status: allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",

        receivedAt: allReceived ? new Date() : null,
      },
    });

    const updatedPurchaseOrder = await transaction.purchaseOrder.findUnique({
      where: {
        id: purchaseOrderId,
      },

      include: {
        vendor: true,

        lines: {
          include: {
            part: true,

            repairOrderPartLine: true,
          },

          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return {
      purchaseOrder: updatedPurchaseOrder,

      lineNotFound: false,

      exceedsRemaining: false,

      inventoryFailed: false,
    };
  });
}

//************************************************************** */

export async function cancelPurchaseOrderRecord(
  organizationId: string,
  purchaseOrderId: string,
  createdByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(async (transaction) => {
    const purchaseOrder = await transaction.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,

        organizationId,
      },

      include: {
        lines: true,
      },
    });

    if (!purchaseOrder) {
      return null;
    }

    if (
      purchaseOrder.status !== "ORDERED" &&
      purchaseOrder.status !== "PARTIALLY_RECEIVED"
    ) {
      return {
        purchaseOrder,

        notCancellable: true,
      };
    }

    for (const line of purchaseOrder.lines) {
      const orderedQty = Number(line.orderedQty.toString());

      const receivedQty = Number(line.receivedQty.toString());

      const remainingQty = orderedQty - receivedQty;

      if (remainingQty <= 0) {
        continue;
      }

      // Only inventory-backed lines have qtyOnOrder to reverse.
      if (line.partId) {
        const inventoryResult = await applyInventoryMutationWithTransaction(
          transaction,
          {
            partId: line.partId,

            type: PartInventoryTransactionType.PURCHASE_CANCELLED,

            quantity: remainingQty,

            onOrderDelta: -remainingQty,

            referenceType: "PURCHASE_ORDER",

            referenceId: purchaseOrder.id,

            ...(notes !== undefined
              ? {
                  notes,
                }
              : {}),

            createdByMembershipId,
          },
        );

        if (!inventoryResult) {
          return {
            purchaseOrder,

            inventoryFailed: true,
          };
        }
      }

      if (line.repairOrderPartLineId) {
        const repairOrderPartLine =
          await transaction.repairOrderPartLine.findUnique({
            where: {
              id: line.repairOrderPartLineId,
            },
          });

        if (repairOrderPartLine) {
          const currentOrderedQty = Number(
            repairOrderPartLine.orderedQty.toString(),
          );

          const newOrderedQty = Math.max(0, currentOrderedQty - remainingQty);

          const currentReceivedQty = Number(
            repairOrderPartLine.receivedQty.toString(),
          );

          const requiredQty = Number(
            repairOrderPartLine.requiredQty.toString(),
          );

          let status: "RECEIVED" | "BACKORDERED" | "TO_BE_ORDERED";

          if (currentReceivedQty >= requiredQty) {
            status = "RECEIVED";
          } else if (currentReceivedQty > 0) {
            status = "BACKORDERED";
          } else {
            status = "TO_BE_ORDERED";
          }

          await transaction.repairOrderPartLine.update({
            where: {
              id: line.repairOrderPartLineId,
            },

            data: {
              orderedQty: newOrderedQty,

              status,
            },
          });
        }
      }
    }

    await transaction.purchaseOrder.update({
      where: {
        id: purchaseOrderId,
      },

      data: {
        status: "CANCELLED",
      },
    });

    const updatedPurchaseOrder = await transaction.purchaseOrder.findUnique({
      where: {
        id: purchaseOrderId,
      },

      include: {
        vendor: true,

        lines: {
          include: {
            part: true,

            repairOrderPartLine: true,
          },

          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return {
      purchaseOrder: updatedPurchaseOrder,

      notCancellable: false,

      inventoryFailed: false,
    };
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
      id: purchaseOrderId,

      organizationId,
    },

    data: {
      ...(input.vendorId !== undefined
        ? {
            vendorId: input.vendorId,
          }
        : {}),

      ...(input.expectedAt !== undefined
        ? {
            expectedAt: input.expectedAt,
          }
        : {}),

      ...(input.vendorReference !== undefined
        ? {
            vendorReference: input.vendorReference,
          }
        : {}),

      ...(input.shippingCost !== undefined
        ? {
            shippingCost: input.shippingCost,
          }
        : {}),

      ...(input.taxAmount !== undefined
        ? {
            taxAmount: input.taxAmount,
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
