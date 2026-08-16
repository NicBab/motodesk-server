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
// Generic edits.
//
// Inventory-controlled fields are intentionally excluded.
// Those fields must be changed through dedicated workflow
// operations so the Part inventory ledger cannot be bypassed.

export const updateRepairOrderPartLineSchema =
  repairOrderPartLineSchema
    .omit({
      partId: true,
      status: true,
      allocatedQty: true,
      orderedQty: true,
      receivedQty: true,
      pulledQty: true,
      installedQty: true,
    })
    .partial();

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
// Inventory workflow actions

export const allocateRepairOrderPartSchema =
  z.object({
    quantity: z
      .number()
      .positive(
        "Allocation quantity must be greater than zero.",
      ),

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  });

//************************************************************** */

export const deallocateRepairOrderPartSchema =
  z.object({
    quantity: z
      .number()
      .positive(
        "Deallocation quantity must be greater than zero.",
      ),

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  });

//************************************************************** */

export const issueRepairOrderPartSchema =
  z.object({
    quantity: z
      .number()
      .positive(
        "Issue quantity must be greater than zero.",
      ),

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  });

//************************************************************** */

export const installRepairOrderPartSchema =
  z.object({
    quantity: z
      .number()
      .positive(
        "Installed quantity must be greater than zero.",
      ),

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  });

  //************************************************************** */

export const markRepairOrderPartToBeOrderedSchema =
  z.object({
    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  });

//************************************************************** */

export type MarkRepairOrderPartToBeOrderedInput =
  z.infer<
    typeof markRepairOrderPartToBeOrderedSchema
  >;

//************************************************************** */

export type CreateRepairOrderPartLineInput =
  z.infer<
    typeof createRepairOrderPartLineSchema
  >;

//************************************************************** */

export type UpdateRepairOrderPartLineInput =
  z.infer<
    typeof updateRepairOrderPartLineSchema
  >;

//************************************************************** */

export type RepairOrderPartLineIdInput =
  z.infer<
    typeof repairOrderPartLineIdSchema
  >;

//************************************************************** */

export type RepairOrderPartParamsInput =
  z.infer<
    typeof repairOrderPartParamsSchema
  >;

//************************************************************** */

export type AllocateRepairOrderPartInput =
  z.infer<
    typeof allocateRepairOrderPartSchema
  >;

//************************************************************** */

export type DeallocateRepairOrderPartInput =
  z.infer<
    typeof deallocateRepairOrderPartSchema
  >;

//************************************************************** */

export type IssueRepairOrderPartInput =
  z.infer<
    typeof issueRepairOrderPartSchema
  >;

//************************************************************** */

export type InstallRepairOrderPartInput =
  z.infer<
    typeof installRepairOrderPartSchema
  >;

//************************************************************** */