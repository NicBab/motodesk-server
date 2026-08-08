import { z } from "zod";
import { createOrganizationSchema } from "../organizations/organization.contracts.js";

//************************************************************** */

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .max(254, "Email address cannot exceed 254 characters.")
  .transform((email) => email.toLowerCase());

//************************************************************** */

const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(128, "Password cannot exceed 128 characters.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/\d/, "Password must contain at least one number.")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character.",
  );

//************************************************************** */

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(100, "Name cannot exceed 100 characters.");

//************************************************************** */

const optionalPhoneSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}, z.string().min(7, "Phone number must contain at least 7 characters.").max(30, "Phone number cannot exceed 30 characters.").optional());

//************************************************************** */

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: optionalPhoneSchema,

  organization: createOrganizationSchema.optional(),
});

//************************************************************** */

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Password is required.")
    .max(128, "Password cannot exceed 128 characters."),
});

//************************************************************** */

export const refreshSessionSchema = z.object({
  refreshToken: z.string().trim().min(1, "Refresh token is required."),
});

//************************************************************** */

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1, "Refresh token is required."),
});

//************************************************************** */

export const switchOrganizationSchema = z.object({
  organizationId: z.string().trim().min(1, "Organization ID is required."),
});

//************************************************************** */

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;

//************************************************************** */









