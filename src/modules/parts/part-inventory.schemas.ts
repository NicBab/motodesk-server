import { z } from "zod";

//************************************************************** */

export const inventoryAdjustmentSchema =
  z.object({
    quantity: z
      .number()
      .refine(
        (value) =>
          value !== 0,
        "Adjustment quantity cannot be zero.",
      ),

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  });

//************************************************************** */

export const inventoryReceiptSchema =
  z.object({
    quantity: z
      .number()
      .positive(
        "Receipt quantity must be greater than zero.",
      ),

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),

    referenceType: z
      .string()
      .trim()
      .max(100)
      .optional(),

    referenceId: z
      .string()
      .trim()
      .max(200)
      .optional(),
  });

//************************************************************** */

export const inventoryAllocationSchema =
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

    referenceType: z
      .string()
      .trim()
      .max(100)
      .optional(),

    referenceId: z
      .string()
      .trim()
      .max(200)
      .optional(),
  });

//************************************************************** */

export const inventoryDeallocationSchema =
  inventoryAllocationSchema;

//************************************************************** */

export const inventoryIssueSchema =
  inventoryAllocationSchema;

//************************************************************** */

export const inventoryReturnSchema =
  inventoryReceiptSchema;

//************************************************************** */

export const inventoryDamageSchema =
  inventoryAllocationSchema;

//************************************************************** */

export const inventoryCycleCountSchema =
  z.object({
    countedQuantity: z
      .number()
      .nonnegative(
        "Counted quantity cannot be negative.",
      ),

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  });

//************************************************************** */

export type InventoryAdjustmentInput =
  z.infer<
    typeof inventoryAdjustmentSchema
  >;

export type InventoryReceiptInput =
  z.infer<
    typeof inventoryReceiptSchema
  >;

export type InventoryAllocationInput =
  z.infer<
    typeof inventoryAllocationSchema
  >;

export type InventoryDeallocationInput =
  z.infer<
    typeof inventoryDeallocationSchema
  >;

export type InventoryIssueInput =
  z.infer<
    typeof inventoryIssueSchema
  >;

export type InventoryReturnInput =
  z.infer<
    typeof inventoryReturnSchema
  >;

export type InventoryDamageInput =
  z.infer<
    typeof inventoryDamageSchema
  >;

export type InventoryCycleCountInput =
  z.infer<
    typeof inventoryCycleCountSchema
  >;