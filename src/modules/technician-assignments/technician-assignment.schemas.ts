import { z } from "zod";

//************************************************************** */
// Assign Technician

export const assignTechnicianSchema =
  z.object({
    technicianMembershipId:
      z.string()
        .trim()
        .min(
          1,
          "Technician membership ID is required.",
        ),

    notes:
      z.string()
        .trim()
        .max(2000)
        .optional(),
  });

//************************************************************** */

export type AssignTechnicianInput =
  z.infer<
    typeof assignTechnicianSchema
  >;