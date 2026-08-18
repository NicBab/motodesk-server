import { z } from "zod";

//************************************************************** */
// Assign Technician

export const assignTechnicianSchema = z.object({
  technicianMembershipId: z
    .string()
    .trim()
    .min(1, "Technician membership ID is required."),

  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */
// Reassign Technician

export const reassignTechnicianSchema = z.object({
  technicianMembershipId: z
    .string()
    .trim()
    .min(1, "Technician membership ID is required."),

  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */
// Remove Technician Assignment

export const removeTechnicianAssignmentSchema = z.object({
  notes: z.string().trim().min(1, "Removal notes are required.").max(2000),
});

//************************************************************** */

export type RemoveTechnicianAssignmentInput = z.infer<
  typeof removeTechnicianAssignmentSchema
>;

//************************************************************** */

export type ReassignTechnicianInput = z.infer<typeof reassignTechnicianSchema>;

//************************************************************** */

export type AssignTechnicianInput = z.infer<typeof assignTechnicianSchema>;
