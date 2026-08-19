import { z } from "zod";

//************************************************************** */
// Reopen Repair Order

export const reopenRepairOrderSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(1, "A reason for reopening the repair order is required.")
    .max(2000),
});

//************************************************************** */

export type ReopenRepairOrderInput = z.infer<typeof reopenRepairOrderSchema>;
