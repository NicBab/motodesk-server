import { z } from "zod";

//************************************************************** */

export const switchOrganizationSchema = z.object({
  organizationId: z.string().trim().min(1, "Organization ID is required."),
});

//************************************************************** */

export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;

//************************************************************** */
