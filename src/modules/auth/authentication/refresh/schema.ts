import { z } from "zod";

//************************************************************** */

export const refreshSessionSchema = z.object({
  refreshToken: z.string().trim().min(1, "Refresh token is required."),
});

//************************************************************** */

export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;

//************************************************************** */