import { z } from "zod";

//************************************************************** */

export const applicationThemeSchema = z.enum([
  "offroad",
  "marine",
  "lawn",
  "sport",
]);

//************************************************************** */

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),

  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/),

  email: z.string().email().optional(),

  phone: z.string().trim().max(30).optional(),
});

//************************************************************** */

export const organizationIdSchema = z.object({
  organizationId: z.string().trim().min(1, "Organization ID is required."),
});

//************************************************************** */

export const updateOrganizationSchema = createOrganizationSchema
  .partial()
  .extend({
    applicationTheme: applicationThemeSchema.optional(),

    taxRate: z
      .number()
      .min(0, "Tax percentage cannot be less than 0.")
      .max(100, "Tax percentage cannot exceed 100.")
      .optional(),

    shopSuppliesRate: z
      .number()
      .min(0, "Shop supplies percentage cannot be less than 0.")
      .max(100, "Shop supplies percentage cannot exceed 100.")
      .optional(),
  });

//************************************************************** */

export type CreateOrganizationRequest = z.infer<
  typeof createOrganizationSchema
>;

//************************************************************** */

export type UpdateOrganizationRequest = z.infer<
  typeof updateOrganizationSchema
>;

//************************************************************** */

export type OrganizationIdInput = z.infer<typeof organizationIdSchema>;

//************************************************************** */
