import { z } from "zod";

//************************************************************** */
// Pause Repair Order Work

export const pauseRepairOrderWorkSchema = z.object({
  notes: z.string().trim().min(1, "Pause reason is required.").max(2000),
});

//************************************************************** */
// Resume Repair Order Work

export const resumeRepairOrderWorkSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export type PauseRepairOrderWorkInput = z.infer<
  typeof pauseRepairOrderWorkSchema
>;

export type ResumeRepairOrderWorkInput = z.infer<
  typeof resumeRepairOrderWorkSchema
>;
