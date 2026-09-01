import {
  PartInventoryTransactionType,
  type SalePaymentMethod,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import { applyInventoryMutationWithTransaction } from "../parts/part-inventory.repository.js";

import type { ListSalesQueryInput } from "./sale.schemas.js";

//************************************************************** */

export type PosSaleLineSnapshot = {
  partId: string;

  partNumber: string;

  description: string;

  quantity: number;

  unitPrice: number;
};

//************************************************************** */

export type PosSalePaymentSnapshot = {
  method:
    | "CASH"
    | "CREDIT_CARD"
    | "DEBIT_CARD"
    | "CHECK"
    | "ACH"
    | "EXTERNAL_TERMINAL";

  amount: number;

  reference?: string;

  remote: boolean;
};

//************************************************************** */

export type CreatePosSaleRecordData = {
  customerId: string | null;

  customerName: string;

  subtotal: number;

  discountAmount: number;

  discountReason: string | null;

  taxRate: number;

  taxAmount: number;

  total: number;

  paymentMethod: SalePaymentMethod;

  cashierMembershipId: string | null;

  cashierName: string | null;

  managerNotes: string | null;

  lines: PosSaleLineSnapshot[];

  payments: PosSalePaymentSnapshot[];
};

//************************************************************** */

export type SaleReturnLineSnapshot = {
  originalSaleLineId: string;

  partId: string | null;

  partNumber: string | null;

  description: string;

  quantity: number;

  unitPrice: number;
};

//************************************************************** */

export type CreateSaleReturnRecordData = {
  originalSaleId: string;

  originalSaleNumber: number;

  customerId: string | null;

  customerName: string;

  subtotal: number;

  discountAmount: number;

  taxRate: number;

  taxAmount: number;

  total: number;

  paymentMethod: SalePaymentMethod;

  returnReason:
    | "WRONG_PART"
    | "DEFECTIVE_PART"
    | "WARRANTY"
    | "CUSTOMER_CANCELLED"
    | "DUPLICATE_SALE"
    | "PRICING_ADJUSTMENT"
    | "LABOR_REFUND"
    | "GOODWILL"
    | "INVENTORY_CORRECTION"
    | "OTHER";

  returnDisposition: "RETURN_TO_INVENTORY" | "SCRAP_NON_RESELLABLE";

  managerNotes: string | null;

  processedByMembershipId: string | null;

  processedByName: string | null;

  lines: SaleReturnLineSnapshot[];

  payments: PosSalePaymentSnapshot[];
};

//************************************************************** */

const saleInclude = {
  customer: true,

  repairOrder: true,

  lines: {
    include: {
      part: true,
    },
  },

  payments: true,

  refunds: {
    include: {
      lines: true,

      payments: true,
    },

    orderBy: {
      createdAt: "desc" as const,
    },
  },
} as const;

//************************************************************** */

export async function createPosSaleRecord(
  organizationId: string,
  data: CreatePosSaleRecordData,
) {
  return prisma.$transaction(async (transaction) => {
    /*
     * Re-check inventory inside the same transaction used to create
     * the sale. The service also validates parts before reaching here,
     * but checkout must not rely only on an earlier read.
     */
    for (const line of data.lines) {
      const part = await transaction.part.findFirst({
        where: {
          id: line.partId,

          organizationId,

          isActive: true,
        },
      });

      if (!part) {
        return {
          partNotFound: true as const,

          partId: line.partId,
        };
      }

      const onHand = Number(part.qtyOnHand.toString());

      if (onHand < line.quantity) {
        return {
          insufficientStock: true as const,

          partId: part.id,

          partNumber: part.partNumber,

          availableQty: onHand,

          requestedQty: line.quantity,
        };
      }
    }

    //************************************************************** */

    const sequence = await transaction.saleSequence.upsert({
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

    const saleNumber = sequence.nextNumber - 1;

    //************************************************************** */

    const sale = await transaction.sale.create({
      data: {
        organizationId,

        saleNumber,

        type: "POS",

        status: "COMPLETED",

        customerId: data.customerId,

        customerName: data.customerName,

        subtotal: data.subtotal,

        discountAmount: data.discountAmount,

        discountReason: data.discountReason,

        taxRate: data.taxRate,

        taxAmount: data.taxAmount,

        total: data.total,

        refundedTotal: 0,

        paymentMethod: data.paymentMethod,

        cashierMembershipId: data.cashierMembershipId,

        cashierName: data.cashierName,

        managerNotes: data.managerNotes,

        lines: {
          create: data.lines.map((line) => ({
            type: "PART",

            partId: line.partId,

            partNumber: line.partNumber,

            description: line.description,

            quantity: line.quantity,

            unitPrice: line.unitPrice,
          })),
        },

        payments: {
          create: data.payments.map((payment) => ({
            method: payment.method,

            amount: payment.amount,

            reference: payment.reference ?? null,

            remote: payment.remote,
          })),
        },
      },

      include: saleInclude,
    });

    //************************************************************** */

    for (const line of data.lines) {
      const inventoryResult = await applyInventoryMutationWithTransaction(
        transaction,
        {
          partId: line.partId,

          type: PartInventoryTransactionType.SALE,

          quantity: line.quantity,

          onHandDelta: -line.quantity,

          referenceType: "SALE",

          referenceId: sale.id,

          notes: `POS sale #${sale.saleNumber}`,

          createdByMembershipId: data.cashierMembershipId,
        },
      );

      if (!inventoryResult) {
        throw new Error(
          `Inventory mutation failed for POS sale part ${line.partId}.`,
        );
      }

      if (Number(inventoryResult.part.qtyOnHand.toString()) < 0) {
        throw new Error(
          `POS sale would create negative inventory for part ${line.partId}.`,
        );
      }
    }

    //************************************************************** */

    return {
      sale,
    };
  });
}

//************************************************************** */

export async function findSaleById(organizationId: string, saleId: string) {
  return prisma.sale.findFirst({
    where: {
      id: saleId,

      organizationId,
    },

    include: saleInclude,
  });
}

//************************************************************** */

export async function findSalesByOrganization(
  organizationId: string,
  query: ListSalesQueryInput,
) {
  const numericSearch =
    query.search && /^\d+$/.test(query.search) ? Number(query.search) : null;

  return prisma.sale.findMany({
    where: {
      organizationId,

      ...(query.type
        ? {
            type: query.type,
          }
        : {}),

      ...(query.status
        ? {
            status: query.status,
          }
        : {}),

      ...(query.customerId
        ? {
            customerId: query.customerId,
          }
        : {}),

      ...(query.repairOrderId
        ? {
            repairOrderId: query.repairOrderId,
          }
        : {}),

      ...(query.search
        ? {
            OR: [
              ...(numericSearch !== null
                ? [
                    {
                      saleNumber: numericSearch,
                    },
                  ]
                : []),

              {
                customerName: {
                  contains: query.search,

                  mode: "insensitive" as const,
                },
              },

              {
                lines: {
                  some: {
                    OR: [
                      {
                        partNumber: {
                          contains: query.search,

                          mode: "insensitive" as const,
                        },
                      },

                      {
                        description: {
                          contains: query.search,

                          mode: "insensitive" as const,
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

    include: saleInclude,

    orderBy: {
      createdAt: "desc",
    },
  });
}

//************************************************************** */

//************************************************************** */

export async function createSaleReturnRecord(
  organizationId: string,
  data: CreateSaleReturnRecordData,
) {
  return prisma.$transaction(async (transaction) => {
    const originalSale = await transaction.sale.findFirst({
      where: {
        id: data.originalSaleId,

        organizationId,

        type: "POS",
      },

      include: {
        lines: true,
      },
    });

    if (!originalSale) {
      return {
        originalSaleNotFound: true as const,
      };
    }

    if (originalSale.status === "VOID") {
      return {
        originalSaleUnavailable: true as const,
      };
    }

    const originalLineById = new Map(
      originalSale.lines.map((line) => [line.id, line]),
    );

    for (const line of data.lines) {
      const originalLine = originalLineById.get(line.originalSaleLineId);

      if (!originalLine) {
        return {
          lineNotFound: true as const,

          originalSaleLineId: line.originalSaleLineId,
        };
      }

      const soldQty = Number(originalLine.quantity.toString());

      const alreadyReturnedQty = Number(originalLine.returnedQty.toString());

      const remainingQty = Math.max(soldQty - alreadyReturnedQty, 0);

      if (line.quantity > remainingQty) {
        return {
          exceedsRemaining: true as const,

          originalSaleLineId: originalLine.id,

          remainingQty,

          requestedQty: line.quantity,
        };
      }
    }

    //************************************************************** */

    const sequence = await transaction.saleSequence.upsert({
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

    const saleNumber = sequence.nextNumber - 1;

    //************************************************************** */

    const refundSale = await transaction.sale.create({
      data: {
        organizationId,

        saleNumber,

        type: "REFUND",

        status: "COMPLETED",

        customerId: data.customerId,

        customerName: data.customerName,

        subtotal: data.subtotal,

        discountAmount: data.discountAmount,

        taxRate: data.taxRate,

        taxAmount: data.taxAmount,

        total: data.total,

        refundedTotal: 0,

        paymentMethod: data.paymentMethod,

        originalSaleId: data.originalSaleId,

        originalSaleNumber: data.originalSaleNumber,

        returnReason: data.returnReason,

        returnDisposition: data.returnDisposition,

        managerNotes: data.managerNotes,

        processedByMembershipId: data.processedByMembershipId,

        processedByName: data.processedByName,

        lines: {
          create: data.lines.map((line) => ({
            type: "PART",

            partId: line.partId,

            originalSaleLineId: line.originalSaleLineId,

            partNumber: line.partNumber,

            description: line.description,

            quantity: line.quantity,

            unitPrice: line.unitPrice,
          })),
        },

        payments: {
          create: data.payments.map((payment) => ({
            method: payment.method,

            amount: payment.amount,

            reference: payment.reference ?? null,

            remote: payment.remote,
          })),
        },
      },
    });

    //************************************************************** */

    for (const line of data.lines) {
      const originalLine = originalLineById.get(line.originalSaleLineId)!;

      await transaction.saleLine.update({
        where: {
          id: originalLine.id,
        },

        data: {
          returnedQty: {
            increment: line.quantity,
          },
        },
      });

      if (data.returnDisposition === "RETURN_TO_INVENTORY" && line.partId) {
        const inventoryResult = await applyInventoryMutationWithTransaction(
          transaction,
          {
            partId: line.partId,

            type: PartInventoryTransactionType.RETURN,

            quantity: line.quantity,

            onHandDelta: line.quantity,

            referenceType: "SALE_RETURN",

            referenceId: refundSale.id,

            notes: `POS return #${refundSale.saleNumber} for sale #${data.originalSaleNumber}`,

            createdByMembershipId: data.processedByMembershipId,
          },
        );

        if (!inventoryResult) {
          throw new Error(
            `Inventory return failed for POS return part ${line.partId}.`,
          );
        }
      }
    }

    //************************************************************** */

    const newRefundedTotal =
      Number(originalSale.refundedTotal.toString()) + data.total;

    const originalTotal = Number(originalSale.total.toString());

    await transaction.sale.update({
      where: {
        id: originalSale.id,
      },

      data: {
        refundedTotal: newRefundedTotal,

        status:
          newRefundedTotal >= originalTotal - 0.009
            ? "REFUNDED"
            : newRefundedTotal > 0
              ? "PARTIALLY_REFUNDED"
              : "COMPLETED",
      },
    });

    //************************************************************** */

    const sale = await transaction.sale.findUniqueOrThrow({
      where: {
        id: refundSale.id,
      },

      include: saleInclude,
    });

    return {
      sale,
    };
  });
}
