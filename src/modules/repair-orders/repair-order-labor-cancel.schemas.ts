import { z } from "zod";

//************************************************************** */
// Cancel Repair Order Labor Line

export const cancelRepairOrderLaborLineSchema = z.object({
  notes: z.string().trim().min(1, "Cancellation reason is required.").max(2000),
});

//************************************************************** */

export type CancelRepairOrderLaborLineInput = z.infer<
  typeof cancelRepairOrderLaborLineSchema
>;
