import { prisma } from "../../config/prisma.js";

import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQueryInput,
  UpdatePurchaseOrderInput,
  ReceivePurchaseOrderLineInput,
  ReceivePurchaseOrderInput,
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

const purchaseOrderInclude = {
  vendor: true,

  lines: {
    include: {
      part: true,
      repairOrderPartLine: true,
    },

    orderBy: {
      createdAt: "asc" as const,
    },
  },

  receipts: {
    include: {
      receivedByMembership: {
        include: {
          user: true,
        },
      },

      lines: {
        include: {
          part: true,
          repairOrderPartLine: true,
        },

        orderBy: {
          createdAt: "asc" as const,
        },
      },
    },

    orderBy: {
      receivedAt: "desc" as const,
    },
  },
} as const;

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

      include: purchaseOrderInclude,
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

    include: purchaseOrderInclude,
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

    include: purchaseOrderInclude,

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

      include: purchaseOrderInclude,
    });

    return {
      purchaseOrder: updatedPurchaseOrder,

      alreadyOrdered: false,

      inventoryFailed: false,
    };
  });
}

//************************************************************** */

class PurchaseOrderReceiptTransactionError extends Error {
  constructor(
    public readonly reason:
      | "LINE_NOT_FOUND"
      | "EXCEEDS_REMAINING"
      | "INVENTORY_FAILED",
    public readonly purchaseOrderLineId?: string,
    public readonly remainingQty?: number,
  ) {
    super(reason);
  }
}

//************************************************************** */

export async function receivePurchaseOrderRecord(
  organizationId: string,
  purchaseOrderId: string,
  input: ReceivePurchaseOrderInput,
  receivedByMembershipId: string | null,
) {
  try {
    return await prisma.$transaction(async (transaction) => {
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

      const lineMap = new Map(
        purchaseOrder.lines.map((line) => [line.id, line]),
      );

      // Validate every receipt line before mutating anything.
      for (const receiptLine of input.lines) {
        const line = lineMap.get(receiptLine.purchaseOrderLineId);

        if (!line) {
          throw new PurchaseOrderReceiptTransactionError(
            "LINE_NOT_FOUND",
            receiptLine.purchaseOrderLineId,
          );
        }

        const orderedQty = Number(line.orderedQty.toString());
        const currentReceivedQty = Number(line.receivedQty.toString());
        const remainingQty = orderedQty - currentReceivedQty;

        if (receiptLine.quantity > remainingQty) {
          throw new PurchaseOrderReceiptTransactionError(
            "EXCEEDS_REMAINING",
            receiptLine.purchaseOrderLineId,
            remainingQty,
          );
        }
      }

      const receivedAt = new Date();

      const receipt = await transaction.purchaseOrderReceipt.create({
        data: {
          organizationId,

          purchaseOrderId,

          invoiceNumber: input.invoiceNumber ?? null,

          packingSlip: input.packingSlip ?? null,

          notes: input.notes ?? null,

          receivedByMembershipId,

          receivedAt,
        },
      });

      for (const receiptLine of input.lines) {
        const line = lineMap.get(receiptLine.purchaseOrderLineId)!;

        const currentReceivedQty = Number(line.receivedQty.toString());

        //************************************************************** */
        // Inventory-backed receipt. Special-order RO lines intentionally
        // remain non-inventory and skip inventory mutation.

        if (line.partId) {
          const inventoryResult = await applyInventoryMutationWithTransaction(
            transaction,
            {
              partId: line.partId,

              type: PartInventoryTransactionType.PURCHASE_RECEIPT,

              quantity: receiptLine.quantity,

              onHandDelta: receiptLine.quantity,

              onOrderDelta: -receiptLine.quantity,

              referenceType: "PURCHASE_ORDER_RECEIPT",

              referenceId: receipt.id,

              ...(receiptLine.notes !== undefined
                ? {
                    notes: receiptLine.notes,
                  }
                : input.notes !== undefined
                  ? {
                      notes: input.notes,
                    }
                  : {}),

              createdByMembershipId: receivedByMembershipId,
            },
          );

          if (!inventoryResult) {
            throw new PurchaseOrderReceiptTransactionError(
              "INVENTORY_FAILED",
              receiptLine.purchaseOrderLineId,
            );
          }
        }

        //************************************************************** */
        // Cumulative PO line state retained for fast operational reads.

        const receivedQty = currentReceivedQty + receiptLine.quantity;

        const damagedQty =
          Number(line.damagedQty.toString()) + receiptLine.damagedQty;

        const backorderedQty =
          Number(line.backorderedQty.toString()) + receiptLine.backorderedQty;

        await transaction.purchaseOrderLine.update({
          where: {
            id: line.id,
          },

          data: {
            receivedQty,

            damagedQty,

            backorderedQty,

            ...(receiptLine.actualCost !== undefined
              ? {
                  actualCost: receiptLine.actualCost,
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

            ...(receiptLine.binLocation !== undefined
              ? {
                  binLocation: receiptLine.binLocation,
                }
              : {}),
          },
        });

        //************************************************************** */
        // Immutable receipt-line history snapshot.

        await transaction.purchaseOrderReceiptLine.create({
          data: {
            receiptId: receipt.id,

            purchaseOrderLineId: line.id,

            partId: line.partId,

            repairOrderPartLineId: line.repairOrderPartLineId,

            partNumber: line.partNumber,

            description: line.description,

            receivedQty: receiptLine.quantity,

            damagedQty: receiptLine.damagedQty,

            backorderedQty: receiptLine.backorderedQty,

            actualCost: receiptLine.actualCost ?? line.actualCost,

            binLocation: receiptLine.binLocation ?? line.binLocation,

            notes: receiptLine.notes ?? null,
          },
        });

        //************************************************************** */
        // Linked RO part line.

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

            const newRoReceivedQty =
              currentRoReceivedQty + receiptLine.quantity;

            const roOrderedQty = Number(
              repairOrderPartLine.orderedQty.toString(),
            );

            const roStatus =
              newRoReceivedQty >= roOrderedQty
                ? "RECEIVED"
                : "PARTIALLY_RECEIVED";

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
      }

      //************************************************************** */
      // Re-evaluate overall PO receipt status after every receipt line.

      const updatedLines = await transaction.purchaseOrderLine.findMany({
        where: {
          purchaseOrderId,
        },
      });

      const allReceived = updatedLines.every(
        (line) =>
          Number(line.receivedQty.toString()) >=
          Number(line.orderedQty.toString()),
      );

      await transaction.purchaseOrder.update({
        where: {
          id: purchaseOrderId,
        },

        data: {
          status: allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",

          receivedAt: allReceived ? receivedAt : null,
        },
      });

      const updatedPurchaseOrder = await transaction.purchaseOrder.findUnique({
        where: {
          id: purchaseOrderId,
        },

        include: purchaseOrderInclude,
      });

      return {
        purchaseOrder: updatedPurchaseOrder,

        receiptId: receipt.id,

        lineNotFound: false,

        exceedsRemaining: false,

        inventoryFailed: false,
      };
    });
  } catch (error) {
    if (error instanceof PurchaseOrderReceiptTransactionError) {
      return {
        purchaseOrder: null,

        receiptId: null,

        lineNotFound: error.reason === "LINE_NOT_FOUND",

        exceedsRemaining: error.reason === "EXCEEDS_REMAINING",

        inventoryFailed: error.reason === "INVENTORY_FAILED",

        purchaseOrderLineId: error.purchaseOrderLineId,

        remainingQty: error.remainingQty,
      };
    }

    throw error;
  }
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

      include: purchaseOrderInclude,
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

      include: purchaseOrderInclude,
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
