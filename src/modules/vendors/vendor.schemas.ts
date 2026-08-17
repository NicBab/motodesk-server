import { z } from "zod";

//************************************************************** */

const vendorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(
      1,
      "Vendor name is required.",
    )
    .max(200),

  accountNumber: z
    .string()
    .trim()
    .max(100)
    .optional(),

  email: z
    .string()
    .trim()
    .email()
    .optional(),

  phone: z
    .string()
    .trim()
    .max(50)
    .optional(),

  website: z
    .string()
    .trim()
    .url()
    .optional(),

  addressLine1: z
    .string()
    .trim()
    .max(200)
    .optional(),

  addressLine2: z
    .string()
    .trim()
    .max(200)
    .optional(),

  city: z
    .string()
    .trim()
    .max(100)
    .optional(),

  state: z
    .string()
    .trim()
    .max(100)
    .optional(),

  postalCode: z
    .string()
    .trim()
    .max(30)
    .optional(),

  country: z
    .string()
    .trim()
    .max(100)
    .optional(),

  contactName: z
    .string()
    .trim()
    .max(150)
    .optional(),

  contactEmail: z
    .string()
    .trim()
    .email()
    .optional(),

  contactPhone: z
    .string()
    .trim()
    .max(50)
    .optional(),

  notes: z
    .string()
    .trim()
    .max(5000)
    .optional(),
});

//************************************************************** */

export const createVendorSchema =
  vendorSchema;

//************************************************************** */

export const updateVendorSchema =
  vendorSchema.partial();

//************************************************************** */

export const vendorIdSchema =
  z.object({
    vendorId: z
      .string()
      .trim()
      .min(
        1,
        "Vendor ID is required.",
      ),
  });

//************************************************************** */

export const listVendorsQuerySchema =
  z.object({
    search: z
      .string()
      .trim()
      .max(150)
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

export type CreateVendorInput =
  z.infer<
    typeof createVendorSchema
  >;

export type UpdateVendorInput =
  z.infer<
    typeof updateVendorSchema
  >;

export type VendorIdInput =
  z.infer<
    typeof vendorIdSchema
  >;

export type ListVendorsQueryInput =
  z.infer<
    typeof listVendorsQuerySchema
  >;