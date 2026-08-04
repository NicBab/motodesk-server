import { z } from "zod";

//************************************************************** */

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(120),

  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/),

  email: z
    .string()
    .email()
    .optional(),

  phone: z
    .string()
    .trim()
    .max(30)
    .optional(),
});

//************************************************************** */

export const organizationIdSchema = z.object({
  organizationId: z
    .string()
    .trim()
    .min(1, "Organization ID is required."),
});

//************************************************************** */

export const updateOrganizationSchema =
  createOrganizationSchema.partial();

//************************************************************** */

export type CreateOrganizationRequest =
  z.infer<typeof createOrganizationSchema>;

//************************************************************** */

export type UpdateOrganizationRequest =
  z.infer<typeof updateOrganizationSchema>;

//************************************************************** */

export type OrganizationIdInput = z.infer<
  typeof organizationIdSchema
>;

//************************************************************** */