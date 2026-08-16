import { z } from "zod";

//************************************************************** */

export const repairOrderPartStatusSchema =
  z.enum([
    "NEEDS_REVIEW",
    "AVAILABLE",
    "ALLOCATED",
    "TO_BE_ORDERED",
    "ORDERED",
    "PARTIALLY_RECEIVED",
    "BACKORDERED",
    "RECEIVED",
    "PULLED",
    "STAGED",
    "ISSUED",
    "INSTALLED",
    "WAIVED",
    "CANCELLED",
  ]);

//************************************************************** */

export const repairOrderPartResolutionMethodSchema =
  z.enum([
    "SHOP_INVENTORY",
    "ORIGINAL_PO",
    "ALTERNATE_VENDOR",
    "LOCAL_DEALER",
    "MANUAL_PURCHASE",
    "APPROVED_SUBSTITUTE",
    "CUSTOMER_SUPPLIED",
    "INVENTORY_TRANSFER",
    "NOT_REQUIRED",
    "MANAGER_OVERRIDE",
  ]);

//************************************************************** */

const repairOrderPartLineSchema =
  z.object({
    partId: z
      .string()
      .trim()
      .min(1)
      .optional(),

    partNumber: z
      .string()
      .trim()
      .min(
        1,
        "Part number is required.",
      )
      .max(150),

    description: z
      .string()
      .trim()
      .min(
        1,
        "Part description is required.",
      )
      .max(500),

    quantity: z
      .number()
      .positive()
      .default(1),

    unitPrice: z
      .number()
      .nonnegative()
      .default(0),

    requiredQty: z
      .number()
      .nonnegative()
      .default(1),

    approvedQty: z
      .number()
      .nonnegative()
      .default(0),

    allocatedQty: z
      .number()
      .nonnegative()
      .default(0),

    orderedQty: z
      .number()
      .nonnegative()
      .default(0),

    receivedQty: z
      .number()
      .nonnegative()
      .default(0),

    pulledQty: z
      .number()
      .nonnegative()
      .default(0),

    installedQty: z
      .number()
      .nonnegative()
      .default(0),

    estimatedCost: z
      .number()
      .nonnegative()
      .default(0),

    actualCost: z
      .number()
      .nonnegative()
      .default(0),

    vendorName: z
      .string()
      .trim()
      .max(200)
      .optional(),

    status:
      repairOrderPartStatusSchema.default(
        "NEEDS_REVIEW",
      ),

    resolutionMethod:
      repairOrderPartResolutionMethodSchema.optional(),

    blocksWork: z
      .boolean()
      .default(true),
  });

//************************************************************** */

export const createRepairOrderPartLineSchema =
  repairOrderPartLineSchema;

//************************************************************** */

export const updateRepairOrderPartLineSchema =
  repairOrderPartLineSchema.partial();

//************************************************************** */

export const repairOrderPartLineIdSchema =
  z.object({
    partLineId: z
      .string()
      .trim()
      .min(
        1,
        "Part line ID is required.",
      ),
  });

//************************************************************** */

export const repairOrderPartParamsSchema =
  z.object({
    repairOrderId: z
      .string()
      .trim()
      .min(
        1,
        "Repair Order ID is required.",
      ),

    partLineId: z
      .string()
      .trim()
      .min(
        1,
        "Part line ID is required.",
      ),
  });

//************************************************************** */

export type CreateRepairOrderPartLineInput =
  z.infer<
    typeof createRepairOrderPartLineSchema
  >;

export type UpdateRepairOrderPartLineInput =
  z.infer<
    typeof updateRepairOrderPartLineSchema
  >;

export type RepairOrderPartLineIdInput =
  z.infer<
    typeof repairOrderPartLineIdSchema
  >;

export type RepairOrderPartParamsInput =
  z.infer<
    typeof repairOrderPartParamsSchema
  >;