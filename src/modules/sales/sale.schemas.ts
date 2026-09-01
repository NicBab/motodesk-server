import { z } from "zod";

//************************************************************** */

export const saleTypeSchema = z.enum(["POS", "RO", "REFUND"]);

//************************************************************** */

export const saleStatusSchema = z.enum([
  "COMPLETED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "VOID",
]);

//************************************************************** */

export const salePaymentMethodSchema = z.enum([
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CHECK",
  "ACH",
  "EXTERNAL_TERMINAL",
  "SPLIT",
]);

//************************************************************** */

export const saleTenderMethodSchema = z.enum([
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CHECK",
  "ACH",
  "EXTERNAL_TERMINAL",
]);

//************************************************************** */

export const saleReturnReasonSchema = z.enum([
  "WRONG_PART",
  "DEFECTIVE_PART",
  "WARRANTY",
  "CUSTOMER_CANCELLED",
  "DUPLICATE_SALE",
  "PRICING_ADJUSTMENT",
  "LABOR_REFUND",
  "GOODWILL",
  "INVENTORY_CORRECTION",
  "OTHER",
]);

//************************************************************** */

export const saleReturnDispositionSchema = z.enum([
  "RETURN_TO_INVENTORY",
  "SCRAP_NON_RESELLABLE",
]);

//************************************************************** */

export const createPosSaleLineSchema = z.object({
  partId: z.string().trim().min(1, "Part ID is required."),

  quantity: z.number().positive("Sale quantity must be greater than zero."),

  unitPrice: z
    .number()
    .nonnegative("Unit price cannot be negative.")
    .optional(),
});

//************************************************************** */

export const createSalePaymentSchema = z.object({
  method: saleTenderMethodSchema,

  amount: z.number().positive("Payment amount must be greater than zero."),

  reference: z.string().trim().max(250).optional(),

  remote: z.boolean().default(false),
});

//************************************************************** */

export const createPosSaleSchema = z.object({
  customerId: z.string().trim().min(1).optional(),

  taxRate: z.number().min(0).max(100).default(0),

  discountAmount: z.number().nonnegative().default(0),

  discountReason: z.string().trim().max(500).optional(),

  managerNotes: z.string().trim().max(5000).optional(),

  lines: z
    .array(createPosSaleLineSchema)
    .min(1, "At least one sale line is required."),

  payments: z
    .array(createSalePaymentSchema)
    .min(1, "At least one payment is required."),
});

//************************************************************** */

export const saleIdSchema = z.object({
  saleId: z.string().trim().min(1, "Sale ID is required."),
});

//************************************************************** */

export const listSalesQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),

  type: saleTypeSchema.optional(),

  status: saleStatusSchema.optional(),

  customerId: z.string().trim().min(1).optional(),

  repairOrderId: z.string().trim().min(1).optional(),
});

//************************************************************** */

export const createSaleReturnLineSchema = z.object({
  originalSaleLineId: z
    .string()
    .trim()
    .min(1, "Original sale line ID is required."),

  quantity: z.number().positive("Return quantity must be greater than zero."),
});

//************************************************************** */

export const createSaleReturnSchema = z.object({
  reason: saleReturnReasonSchema,

  disposition: saleReturnDispositionSchema,

  managerNotes: z.string().trim().max(5000).optional(),

  lines: z
    .array(createSaleReturnLineSchema)
    .min(1, "At least one return line is required."),

  payments: z
    .array(createSalePaymentSchema)
    .min(1, "At least one refund payment is required."),
});

//************************************************************** */

export type CreatePosSaleLineInput = z.infer<typeof createPosSaleLineSchema>;

export type CreateSalePaymentInput = z.infer<typeof createSalePaymentSchema>;

export type CreatePosSaleInput = z.infer<typeof createPosSaleSchema>;

export type SaleIdInput = z.infer<typeof saleIdSchema>;

export type ListSalesQueryInput = z.infer<typeof listSalesQuerySchema>;

export type CreateSaleReturnInput = z.infer<typeof createSaleReturnSchema>;

//************************************************************** */
