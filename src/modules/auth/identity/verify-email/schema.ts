import { z } from "zod";

//************************************************************** */

export const verifyEmailSchema = z.object({
  token: z
    .string()
    .trim()
    .min(
      1,
      "Email-verification token is required.",
    ),
});

//************************************************************** */

export type VerifyEmailInput =
  z.infer<typeof verifyEmailSchema>;