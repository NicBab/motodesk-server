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

export const purchaseOrderLineSchema = z
  .object({
    partId: z.string().trim().min(1).optional(),

    repairOrderPartLineId: z.string().trim().min(1).optional(),

    partNumber: z
      .string()
      .trim()
      .min(1, "Part number is required.")
      .max(150)
      .optional(),

    description: z
      .string()
      .trim()
      .min(1, "Description is required.")
      .max(500)
      .optional(),

    orderedQty: z
      .number()
      .positive("Ordered quantity must be greater than zero."),

    unitCost: z.number().nonnegative().default(0),
  })
  .superRefine((line, context) => {
    if (!line.partId && !line.partNumber) {
      context.addIssue({
        code: "custom",

        path: ["partNumber"],

        message: "Part number is required for a manual PO line.",
      });
    }

    if (!line.partId && !line.description) {
      context.addIssue({
        code: "custom",

        path: ["description"],

        message: "Description is required for a manual PO line.",
      });
    }
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

  expectedAt: z.coerce.date().nullable().optional(),

  vendorReference: z.string().trim().max(200).nullable().optional(),

  shippingCost: z.number().nonnegative().optional(),

  taxAmount: z.number().nonnegative().optional(),

  notes: z.string().trim().max(5000).nullable().optional(),

  lines: z
    .array(purchaseOrderLineSchema)
    .min(1, "At least one purchase order line is required.")
    .optional(),
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
// Legacy single-line receipt contract.
// Kept temporarily so the current service/controller continue to compile
// while the batch receipt endpoint is introduced in the next layer.

export const receivePurchaseOrderLineSchema = z.object({
  purchaseOrderLineId: z
    .string()
    .trim()
    .min(1, "Purchase Order Line ID is required."),

  quantity: z.number().positive("Received quantity must be greater than zero."),

  damagedQty: z.number().nonnegative().default(0),

  backorderedQty: z.number().nonnegative().default(0),

  actualCost: z.number().nonnegative().optional(),

  invoiceNumber: z.string().trim().max(200).optional(),

  packingSlip: z.string().trim().max(200).optional(),

  binLocation: z.string().trim().max(100).optional(),

  notes: z.string().trim().max(1000).optional(),
});

//************************************************************** */
// One Save Receipt = one receipt header with one or more receipt lines.

const receivePurchaseOrderReceiptLineSchema = z.object({
  purchaseOrderLineId: z
    .string()
    .trim()
    .min(1, "Purchase Order Line ID is required."),

  quantity: z.number().positive("Received quantity must be greater than zero."),

  damagedQty: z.number().nonnegative().default(0),

  backorderedQty: z.number().nonnegative().default(0),

  actualCost: z.number().nonnegative().optional(),

  binLocation: z.string().trim().max(100).optional(),

  notes: z.string().trim().max(1000).optional(),
});

//************************************************************** */

export const receivePurchaseOrderSchema = z
  .object({
    invoiceNumber: z.string().trim().max(200).optional(),

    packingSlip: z.string().trim().max(200).optional(),

    notes: z.string().trim().max(5000).optional(),

    lines: z
      .array(receivePurchaseOrderReceiptLineSchema)
      .min(1, "At least one receipt line is required."),
  })
  .superRefine((input, context) => {
    const seenLineIds = new Set<string>();

    input.lines.forEach((line, index) => {
      if (seenLineIds.has(line.purchaseOrderLineId)) {
        context.addIssue({
          code: "custom",

          path: ["lines", index, "purchaseOrderLineId"],

          message: "A purchase order line may only appear once per receipt.",
        });
      }

      seenLineIds.add(line.purchaseOrderLineId);
    });
  });

//************************************************************** */

export const cancelPurchaseOrderSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});

//************************************************************** */

export type CancelPurchaseOrderInput = z.infer<
  typeof cancelPurchaseOrderSchema
>;

export type ReceivePurchaseOrderLineInput = z.infer<
  typeof receivePurchaseOrderLineSchema
>;

export type ReceivePurchaseOrderInput = z.infer<
  typeof receivePurchaseOrderSchema
>;

export type PurchaseOrderLineInput = z.infer<
  typeof purchaseOrderLineSchema
>;

export type CreatePurchaseOrderInput = z.infer<
  typeof createPurchaseOrderSchema
>;

export type UpdatePurchaseOrderInput = z.infer<
  typeof updatePurchaseOrderSchema
>;

export type PurchaseOrderIdInput = z.infer<typeof purchaseOrderIdSchema>;

export type ListPurchaseOrdersQueryInput = z.infer<
  typeof listPurchaseOrdersQuerySchema
>;

//************************************************************** */
