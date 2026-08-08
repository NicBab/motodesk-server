import { z } from "zod";

import {
  emailSchema,
} from "../../shared/validation/index.js";

//************************************************************** */

export const changeEmailSchema = z.object({
  newEmail: emailSchema,

  currentPassword: z
    .string()
    .min(
      1,
      "Current password is required.",
    ),
});

//************************************************************** */

export type ChangeEmailInput =
  z.infer<typeof changeEmailSchema>;