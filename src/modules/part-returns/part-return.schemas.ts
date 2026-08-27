import { z } from "zod";

//************************************************************** */

export const partReturnTypeSchema = z.enum([
  "TO_VENDOR",
  "TO_INVENTORY",
  "WRONG_PART",
  "DAMAGED",
  "UNUSED_RO_PART",
  "CORE_RETURN",
  "WARRANTY_RETURN",
]);

//************************************************************** */

export const partReturnCreditStatusSchema = z.enum(["PENDING", "RECEIVED"]);

//************************************************************** */

export const partReturnStatusSchema = z.enum([
  "PENDING",
  "SHIPPED",
  "CREDITED",
  "CLOSED",
]);

//************************************************************** */

export const createPartReturnSchema = z.object({
  returnType: partReturnTypeSchema.default("TO_VENDOR"),

  partId: z.string().trim().min(1, "Part ID is required."),

  quantity: z.number().positive("Return quantity must be greater than zero."),

  vendorId: z.string().trim().min(1).optional(),

  purchaseOrderId: z.string().trim().min(1).optional(),

  repairOrderId: z.string().trim().min(1).optional(),

  restockingFee: z.number().nonnegative().default(0),

  returnAuthorizationNumber: z.string().trim().max(200).optional(),

  creditAmount: z.number().nonnegative().default(0),

  notes: z.string().trim().max(5000).optional(),
});

//************************************************************** */

export const updatePartReturnSchema = z.object({
  returnType: partReturnTypeSchema.optional(),

  quantity: z
    .number()
    .positive("Return quantity must be greater than zero.")
    .optional(),

  vendorId: z.string().trim().min(1).nullable().optional(),

  purchaseOrderId: z.string().trim().min(1).nullable().optional(),

  repairOrderId: z.string().trim().min(1).nullable().optional(),

  restockingFee: z.number().nonnegative().optional(),

  returnAuthorizationNumber: z.string().trim().max(200).nullable().optional(),

  creditAmount: z.number().nonnegative().optional(),

  notes: z.string().trim().max(5000).nullable().optional(),
});

//************************************************************** */

export const updatePartReturnCreditSchema = z.object({
  creditAmount: z.number().nonnegative(),

  creditStatus: partReturnCreditStatusSchema,
});

//************************************************************** */

export const partReturnIdSchema = z.object({
  partReturnId: z.string().trim().min(1, "Part Return ID is required."),
});

//************************************************************** */

export const listPartReturnsQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),

  returnType: partReturnTypeSchema.optional(),

  status: partReturnStatusSchema.optional(),

  creditStatus: partReturnCreditStatusSchema.optional(),

  vendorId: z.string().trim().min(1).optional(),

  partId: z.string().trim().min(1).optional(),

  purchaseOrderId: z.string().trim().min(1).optional(),

  repairOrderId: z.string().trim().min(1).optional(),

  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

//************************************************************** */

export type CreatePartReturnInput = z.infer<typeof createPartReturnSchema>;

export type UpdatePartReturnInput = z.infer<typeof updatePartReturnSchema>;

export type UpdatePartReturnCreditInput = z.infer<
  typeof updatePartReturnCreditSchema
>;

export type PartReturnIdInput = z.infer<typeof partReturnIdSchema>;

export type ListPartReturnsQueryInput = z.infer<
  typeof listPartReturnsQuerySchema
>;

//************************************************************** */
