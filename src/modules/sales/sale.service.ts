import type { SalePaymentMethod } from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import { findCustomerById } from "../customers/customer.repository.js";

import { findPartById } from "../parts/part.repository.js";

import {
  createPosSaleRecord,
  createSaleReturnRecord,
  findSaleById,
  findSalesByOrganization,
  type PosSaleLineSnapshot,
  type PosSalePaymentSnapshot,
  type SaleReturnLineSnapshot,
} from "./sale.repository.js";

import type {
  CreatePosSaleInput,
  CreateSaleReturnInput,
  ListSalesQueryInput,
} from "./sale.schemas.js";

//************************************************************** */

type CashierContext = {
  membershipId: string | null;

  name: string | null;
};

//************************************************************** */

export async function createPosSale(
  organizationId: string,
  input: CreatePosSaleInput,
  cashier: CashierContext,
) {
  const customer = input.customerId
    ? await findCustomerById(organizationId, input.customerId)
    : null;

  if (input.customerId && !customer) {
    throw new AppError(
      400,
      "The selected customer does not belong to this organization.",
      {
        code: "SALE_CUSTOMER_INVALID",
      },
    );
  }

  if (customer && !customer.isActive) {
    throw new AppError(400, "The selected customer is archived.", {
      code: "SALE_CUSTOMER_ARCHIVED",
    });
  }

  //************************************************************** */

  const lines: PosSaleLineSnapshot[] = [];

  for (const inputLine of input.lines) {
    const part = await findPartById(organizationId, inputLine.partId);

    if (!part) {
      throw new AppError(
        400,
        "A selected POS part does not belong to this organization.",
        {
          code: "SALE_PART_INVALID",
        },
      );
    }

    if (!part.isActive) {
      throw new AppError(
        400,
        `${part.partNumber} is archived and cannot be sold.`,
        {
          code: "SALE_PART_ARCHIVED",
        },
      );
    }

    const availableQty = Number(part.qtyOnHand.toString());

    if (availableQty < inputLine.quantity) {
      throw new AppError(
        400,
        `${part.partNumber} does not have enough stock for this sale.`,
        {
          code: "SALE_INSUFFICIENT_STOCK",

          details: {
            partId: part.id,

            partNumber: part.partNumber,

            availableQty,

            requestedQty: inputLine.quantity,
          },
        },
      );
    }

    const unitPrice = inputLine.unitPrice ?? Number(part.sellPrice.toString());

    lines.push({
      partId: part.id,

      partNumber: part.partNumber,

      description: part.description,

      quantity: inputLine.quantity,

      unitPrice: money(unitPrice),
    });
  }

  //************************************************************** */

  const subtotal = money(
    lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
  );

  if (input.discountAmount > subtotal) {
    throw new AppError(400, "Discount cannot exceed the sale subtotal.", {
      code: "SALE_DISCOUNT_EXCEEDS_SUBTOTAL",
    });
  }

  const discountAmount = money(input.discountAmount);

  const taxableSubtotal = money(Math.max(subtotal - discountAmount, 0));

  const effectiveTaxRate = customer?.taxExempt ? 0 : input.taxRate;

  const taxAmount = money(taxableSubtotal * (effectiveTaxRate / 100));

  const total = money(taxableSubtotal + taxAmount);

  //************************************************************** */

  const payments: PosSalePaymentSnapshot[] = input.payments.map((payment) => ({
    method: payment.method,

    amount: money(payment.amount),

    ...(payment.reference
      ? {
          reference: payment.reference,
        }
      : {}),

    remote: payment.remote,
  }));

  const paymentTotal = money(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
  );

  if (paymentTotal !== total) {
    throw new AppError(400, "Payment total must equal the sale total.", {
      code: "SALE_PAYMENT_TOTAL_MISMATCH",

      details: {
        saleTotal: total,

        paymentTotal,
      },
    });
  }

  const paymentMethod: SalePaymentMethod =
    payments.length === 1 ? payments[0]!.method : "SPLIT";

  const customerName = customer ? formatCustomerName(customer) : "Walk-in";

  //************************************************************** */

  const result = await createPosSaleRecord(organizationId, {
    customerId: customer?.id ?? null,

    customerName,

    subtotal,

    discountAmount,

    discountReason: input.discountReason ?? null,

    taxRate: effectiveTaxRate,

    taxAmount,

    total,

    paymentMethod,

    cashierMembershipId: cashier.membershipId,

    cashierName: cashier.name,

    managerNotes: input.managerNotes ?? null,

    lines,

    payments,
  });

  if ("partNotFound" in result && result.partNotFound) {
    throw new AppError(400, "A selected POS part is no longer available.", {
      code: "SALE_PART_INVALID",
    });
  }

  if ("insufficientStock" in result && result.insufficientStock) {
    throw new AppError(
      409,
      `${result.partNumber} no longer has enough stock to complete the sale.`,
      {
        code: "SALE_INSUFFICIENT_STOCK",

        details: {
          partId: result.partId,

          partNumber: result.partNumber,

          availableQty: result.availableQty,

          requestedQty: result.requestedQty,
        },
      },
    );
  }

  if (!("sale" in result) || !result.sale) {
    throw new AppError(500, "POS sale could not be completed.", {
      code: "SALE_CREATE_FAILED",
    });
  }

  return result.sale;
}

//************************************************************** */

export async function createSaleReturn(
  organizationId: string,
  saleId: string,
  input: CreateSaleReturnInput,
  processor: CashierContext,
) {
  const originalSale = await getSaleById(organizationId, saleId);

  if (originalSale.type !== "POS") {
    throw new AppError(
      400,
      "Only completed POS sales can be returned through this workflow.",
      {
        code: "SALE_RETURN_TYPE_INVALID",
      },
    );
  }

  if (originalSale.status === "VOID") {
    throw new AppError(400, "A voided sale cannot be returned.", {
      code: "SALE_RETURN_UNAVAILABLE",
    });
  }

  //************************************************************** */

  const requestedByLineId = new Map<string, number>();

  for (const inputLine of input.lines) {
    requestedByLineId.set(
      inputLine.originalSaleLineId,
      (requestedByLineId.get(inputLine.originalSaleLineId) ?? 0) +
        inputLine.quantity,
    );
  }

  const returnLines: SaleReturnLineSnapshot[] = [];

  let returnGrossSubtotal = 0;

  for (const [originalSaleLineId, requestedQty] of requestedByLineId) {
    const originalLine = originalSale.lines.find(
      (line) => line.id === originalSaleLineId,
    );

    if (!originalLine) {
      throw new AppError(
        400,
        "A selected return line does not belong to the original sale.",
        {
          code: "SALE_RETURN_LINE_INVALID",
        },
      );
    }

    if (originalLine.type !== "PART") {
      throw new AppError(400, "This MVP return workflow only supports parts.", {
        code: "SALE_RETURN_LINE_TYPE_INVALID",
      });
    }

    const soldQty = Number(originalLine.quantity);

    const returnedQty = Number(originalLine.returnedQty);

    const remainingQty = Math.max(soldQty - returnedQty, 0);

    if (requestedQty > remainingQty) {
      throw new AppError(
        400,
        `${originalLine.partNumber ?? originalLine.description} only has ${remainingQty} remaining to return.`,
        {
          code: "SALE_RETURN_EXCEEDS_REMAINING",
        },
      );
    }

    const unitPrice = Number(originalLine.unitPrice);

    returnGrossSubtotal += requestedQty * unitPrice;

    returnLines.push({
      originalSaleLineId: originalLine.id,

      partId: originalLine.partId,

      partNumber: originalLine.partNumber,

      description: originalLine.description,

      quantity: requestedQty,

      unitPrice: money(unitPrice),
    });
  }

  //************************************************************** */

  const originalSubtotal = Number(originalSale.subtotal);

  const originalDiscount = Number(originalSale.discountAmount);

  const discountRatio =
    originalSubtotal > 0 ? originalDiscount / originalSubtotal : 0;

  const refundSubtotal = money(returnGrossSubtotal);

  const refundDiscount = money(refundSubtotal * discountRatio);

  const taxableRefund = money(Math.max(refundSubtotal - refundDiscount, 0));

  const taxRate = Number(originalSale.taxRate);

  const refundTax = money(taxableRefund * (taxRate / 100));

  const calculatedRefundTotal = money(taxableRefund + refundTax);

  const remainingRefundable = money(
    Math.max(
      Number(originalSale.total) - Number(originalSale.refundedTotal),
      0,
    ),
  );

  const refundTotal = money(
    Math.min(calculatedRefundTotal, remainingRefundable),
  );

  if (refundTotal <= 0) {
    throw new AppError(400, "This sale has no remaining refundable balance.", {
      code: "SALE_NOT_REFUNDABLE",
    });
  }

  //************************************************************** */

  const payments: PosSalePaymentSnapshot[] = input.payments.map((payment) => ({
    method: payment.method,

    amount: money(payment.amount),

    ...(payment.reference
      ? {
          reference: payment.reference,
        }
      : {}),

    remote: payment.remote,
  }));

  const paymentTotal = money(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
  );

  if (paymentTotal !== refundTotal) {
    throw new AppError(
      400,
      "Refund payment total must equal the calculated refund total.",
      {
        code: "SALE_REFUND_PAYMENT_TOTAL_MISMATCH",

        details: {
          refundTotal,

          paymentTotal,
        },
      },
    );
  }

  const paymentMethod: SalePaymentMethod =
    payments.length === 1 ? payments[0]!.method : "SPLIT";

  //************************************************************** */

  const result = await createSaleReturnRecord(organizationId, {
    originalSaleId: originalSale.id,

    originalSaleNumber: originalSale.saleNumber,

    customerId: originalSale.customerId,

    customerName: originalSale.customerName,

    subtotal: refundSubtotal,

    discountAmount: refundDiscount,

    taxRate,

    taxAmount: refundTax,

    total: refundTotal,

    paymentMethod,

    returnReason: input.reason,

    returnDisposition: input.disposition,

    managerNotes: input.managerNotes ?? null,

    processedByMembershipId: processor.membershipId,

    processedByName: processor.name,

    lines: returnLines,

    payments,
  });

  if ("originalSaleNotFound" in result && result.originalSaleNotFound) {
    throw new AppError(404, "Original sale not found.", {
      code: "SALE_NOT_FOUND",
    });
  }

  if ("originalSaleUnavailable" in result && result.originalSaleUnavailable) {
    throw new AppError(
      409,
      "The original sale is no longer available for return.",
      {
        code: "SALE_RETURN_UNAVAILABLE",
      },
    );
  }

  if ("lineNotFound" in result && result.lineNotFound) {
    throw new AppError(
      409,
      "A return line no longer exists on the original sale.",
      {
        code: "SALE_RETURN_LINE_INVALID",
      },
    );
  }

  if ("exceedsRemaining" in result && result.exceedsRemaining) {
    throw new AppError(
      409,
      "The requested return quantity exceeds the remaining returnable quantity.",
      {
        code: "SALE_RETURN_EXCEEDS_REMAINING",
      },
    );
  }

  if (!("sale" in result) || !result.sale) {
    throw new AppError(500, "Sale return could not be completed.", {
      code: "SALE_RETURN_FAILED",
    });
  }

  return result.sale;
}

//************************************************************** */

export async function getSaleById(organizationId: string, saleId: string) {
  const sale = await findSaleById(organizationId, saleId);

  if (!sale) {
    throw new AppError(404, "Sale not found.", {
      code: "SALE_NOT_FOUND",
    });
  }

  return sale;
}

//************************************************************** */

export async function listSales(
  organizationId: string,
  query: ListSalesQueryInput,
) {
  return findSalesByOrganization(organizationId, query);
}

//************************************************************** */

function formatCustomerName(customer: {
  firstName: string | null;

  lastName: string | null;

  companyName: string | null;
}): string {
  if (customer.companyName) {
    return customer.companyName;
  }

  const name = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return name || "Customer";
}

//************************************************************** */

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

//************************************************************** */
