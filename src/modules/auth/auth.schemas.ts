import { z } from "zod";

///************************************************************** */

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1, "Refresh token is required."),
});

//************************************************************** */

export const switchOrganizationSchema = z.object({
  organizationId: z.string().trim().min(1, "Organization ID is required."),
});

//************************************************************** */

export type LogoutInput = z.infer<typeof logoutSchema>;
export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;

//************************************************************** */









