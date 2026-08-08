import { z } from "zod";

import {
  passwordSchema,
} from "../../shared/validation/index.js";

//************************************************************** */

export const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .min(
        1,
        "Password reset token is required.",
      ),

    password: passwordSchema,

    confirmPassword: z
      .string()
      .min(
        1,
        "Password confirmation is required.",
      ),
  })
  .refine(
    (input) =>
      input.password ===
      input.confirmPassword,
    {
      path: ["confirmPassword"],
      message:
        "Password confirmation does not match.",
    },
  );

//************************************************************** */

export type ResetPasswordInput =
  z.infer<typeof resetPasswordSchema>;