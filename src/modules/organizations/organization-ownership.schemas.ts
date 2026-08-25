import { z } from "zod";

//************************************************************** */

export const transferOrganizationOwnershipSchema =
  z.object({
    membershipId: z
      .string()
      .trim()
      .min(
        1,
        "Membership ID is required.",
      ),
  });

//************************************************************** */

export type TransferOrganizationOwnershipInput =
  z.infer<
    typeof transferOrganizationOwnershipSchema
  >;

//************************************************************** */