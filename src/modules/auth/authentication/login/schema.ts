import { z } from "zod";

//************************************************************** */

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .max(254, "Email address cannot exceed 254 characters.")
  .transform((email) => email.toLowerCase());

//************************************************************** */

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Password is required.")
    .max(128, "Password cannot exceed 128 characters."),
});

//************************************************************** */

export type LoginInput = z.infer<typeof loginSchema>;

//************************************************************** */
