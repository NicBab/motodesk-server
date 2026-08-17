import { z } from "zod";

//************************************************************** */

export const purchaseOrderStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
  "CLOSED",
]);

//************************************************************** */

const purchaseOrderLineSchema = z.object({
  partId: z.string().trim().min(1, "Part ID is required."),

  repairOrderPartLineId: z.string().trim().min(1).optional(),

  orderedQty: z
    .number()
    .positive("Ordered quantity must be greater than zero."),

  unitCost: z.number().nonnegative().default(0),
});

//************************************************************** */

export const createPurchaseOrderSchema = z.object({
  vendorId: z.string().trim().min(1, "Vendor ID is required."),

  expectedAt: z.coerce.date().optional(),

  vendorReference: z.string().trim().max(200).optional(),

  shippingCost: z.number().nonnegative().default(0),

  taxAmount: z.number().nonnegative().default(0),

  notes: z.string().trim().max(5000).optional(),

  lines: z
    .array(purchaseOrderLineSchema)
    .min(1, "At least one purchase order line is required."),
});

//************************************************************** */

export const updatePurchaseOrderSchema = z.object({
  vendorId: z.string().trim().min(1).optional(),

  expectedAt: z.coerce.date().optional(),

  vendorReference: z.string().trim().max(200).optional(),

  shippingCost: z.number().nonnegative().optional(),

  taxAmount: z.number().nonnegative().optional(),

  notes: z.string().trim().max(5000).optional(),
});

//************************************************************** */

export const purchaseOrderIdSchema = z.object({
  purchaseOrderId: z.string().trim().min(1, "Purchase Order ID is required."),
});

//************************************************************** */

export const listPurchaseOrdersQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),

  vendorId: z.string().trim().min(1).optional(),

  status: purchaseOrderStatusSchema.optional(),

  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

//************************************************************** */

export const receivePurchaseOrderLineSchema = z.object({
  purchaseOrderLineId: z
    .string()
    .trim()
    .min(1, "Purchase Order Line ID is required."),

  quantity: z.number().positive("Received quantity must be greater than zero."),

  notes: z.string().trim().max(1000).optional(),
});

//************************************************************** */

export const cancelPurchaseOrderSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});

//************************************************************** */

export type CancelPurchaseOrderInput = z.infer<
  typeof cancelPurchaseOrderSchema
>;

//************************************************************** */

export type ReceivePurchaseOrderLineInput = z.infer<
  typeof receivePurchaseOrderLineSchema
>;

//************************************************************** */

export type CreatePurchaseOrderInput = z.infer<
  typeof createPurchaseOrderSchema
>;

//************************************************************** */

export type UpdatePurchaseOrderInput = z.infer<
  typeof updatePurchaseOrderSchema
>;

//************************************************************** */

export type PurchaseOrderIdInput = z.infer<typeof purchaseOrderIdSchema>;

//************************************************************** */

export type ListPurchaseOrdersQueryInput = z.infer<
  typeof listPurchaseOrdersQuerySchema
>;

//************************************************************** */
