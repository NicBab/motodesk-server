import { z } from "zod";

//************************************************************** */

export const reauthenticateSchema =
  z.object({
    currentPassword: z
      .string()
      .min(
        1,
        "Current password is required.",
      ),
  });

//************************************************************** */

export type ReauthenticateInput =
  z.infer<
    typeof reauthenticateSchema
  >;

//************************************************************** */