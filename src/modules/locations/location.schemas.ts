
import { z } from "zod";

//************************************************************** */
// Shared Location Fields
//************************************************************** */

const optionalNullableText = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().optional();

//************************************************************** */
// Create Location
//************************************************************** */

export const createShopLocationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Location name is required.")
    .max(120),

  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9_-]{2,30}$/,
      "Location code must contain 2–30 letters, numbers, underscores, or hyphens.",
    ),

  email: z.string().trim().email().nullable().optional(),

  phone: optionalNullableText(30),

  addressLine1: optionalNullableText(200),
  addressLine2: optionalNullableText(200),
  city: optionalNullableText(120),
  state: optionalNullableText(120),
  postalCode: optionalNullableText(30),

  country: z
    .string()
    .trim()
    .length(2)
    .toUpperCase()
    .optional(),

  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional(),
}).strict();

//************************************************************** */
// Update Location
//************************************************************** */

export const updateShopLocationSchema =
  createShopLocationSchema.partial();

//************************************************************** */
// Route Parameters
//************************************************************** */

export const locationIdSchema = z.object({
  organizationId: z
    .string()
    .trim()
    .min(1, "Organization ID is required."),

  locationId: z
    .string()
    .trim()
    .min(1, "Location ID is required."),
});

//************************************************************** */
// Employee Assignments
//************************************************************** */

export const assignLocationEmployeesSchema = z.object({
  locationId: z
    .string()
    .trim()
    .min(1, "Location ID is required."),

  membershipIds: z
    .array(
      z.string().trim().min(1, "Membership ID is required."),
    )
    .max(500, "A maximum of 500 employees may be assigned.")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Duplicate employee assignments are not allowed.",
    ),
}).strict();

//************************************************************** */
// Request Types
//************************************************************** */

export type CreateShopLocationRequest = z.infer<
  typeof createShopLocationSchema
>;

export type UpdateShopLocationRequest = z.infer<
  typeof updateShopLocationSchema
>;

export type LocationIdInput = z.infer<
  typeof locationIdSchema
>;

export type AssignLocationEmployeesRequest = z.infer<
  typeof assignLocationEmployeesSchema
>;

//************************************************************** */
