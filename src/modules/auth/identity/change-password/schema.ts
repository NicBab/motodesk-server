import { z } from "zod";

import {
  passwordSchema,
} from "../../shared/validation/index.js";

//************************************************************** */

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(
        1,
        "Current password is required.",
      ),

    newPassword: passwordSchema,

    confirmNewPassword: z
      .string()
      .min(
        1,
        "Password confirmation is required.",
      ),
  })
  .refine(
    (input) =>
      input.newPassword ===
      input.confirmNewPassword,
    {
      path: ["confirmNewPassword"],
      message:
        "New password confirmation does not match.",
    },
  );

//************************************************************** */

export type ChangePasswordInput =
  z.infer<typeof changePasswordSchema>;