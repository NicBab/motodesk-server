import { z } from "zod";

//************************************************************** */
// Cancel Repair Order Part Line

export const cancelRepairOrderPartLineSchema =
  z.object({
    notes:
      z.string()
        .trim()
        .min(
          1,
          "Cancellation reason is required.",
        )
        .max(2000),
  });

//************************************************************** */

export type CancelRepairOrderPartLineInput =
  z.infer<
    typeof cancelRepairOrderPartLineSchema
  >;