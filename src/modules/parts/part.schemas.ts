import { z } from "zod";

//************************************************************** */

const partSchema = z.object({
  partNumber: z
    .string()
    .trim()
    .min(
      1,
      "Part number is required.",
    )
    .max(150),

  oemPartNumber: z
    .string()
    .trim()
    .max(150)
    .optional(),

  alternatePartNumbers: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(150),
    )
    .default([]),

  description: z
    .string()
    .trim()
    .min(
      1,
      "Part description is required.",
    )
    .max(500),

  brand: z
    .string()
    .trim()
    .max(150)
    .optional(),

  category: z
    .string()
    .trim()
    .max(150)
    .optional(),

  qtyOnHand: z
    .number()
    .nonnegative()
    .default(0),

  qtyAllocated: z
    .number()
    .nonnegative()
    .default(0),

  qtyOnOrder: z
    .number()
    .nonnegative()
    .default(0),

  reorderPoint: z
    .number()
    .nonnegative()
    .default(0),

  costPrice: z
    .number()
    .nonnegative()
    .default(0),

  sellPrice: z
    .number()
    .nonnegative()
    .default(0),

  location: z
    .string()
    .trim()
    .max(150)
    .optional(),
});

//************************************************************** */

export const createPartSchema =
  partSchema;

//************************************************************** */

export const updatePartSchema =
  partSchema
    .omit({
      qtyOnHand: true,
      qtyAllocated: true,
      qtyOnOrder: true,
    })
    .partial();

//************************************************************** */

export const partIdSchema =
  z.object({
    partId: z
      .string()
      .trim()
      .min(
        1,
        "Part ID is required.",
      ),
  });

//************************************************************** */

export const listPartsQuerySchema =
  z.object({
    search: z
      .string()
      .trim()
      .max(150)
      .optional(),

    brand: z
      .string()
      .trim()
      .max(150)
      .optional(),

    category: z
      .string()
      .trim()
      .max(150)
      .optional(),

    lowStock: z
      .enum([
        "true",
        "false",
      ])
      .transform(
        (value) =>
          value === "true",
      )
      .optional(),

    isActive: z
      .enum([
        "true",
        "false",
      ])
      .transform(
        (value) =>
          value === "true",
      )
      .optional(),
  });

//************************************************************** */

export type CreatePartInput =
  z.infer<
    typeof createPartSchema
  >;

export type UpdatePartInput =
  z.infer<
    typeof updatePartSchema
  >;

export type PartIdInput =
  z.infer<
    typeof partIdSchema
  >;

export type ListPartsQueryInput =
  z.infer<
    typeof listPartsQuerySchema
  >;