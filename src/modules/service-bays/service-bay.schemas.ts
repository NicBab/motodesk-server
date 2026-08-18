import { z } from "zod";

//************************************************************** */
// Create Service Bay

export const createServiceBaySchema = z.object({
  name: z.string().trim().min(1, "Service bay name is required.").max(120),

  description: z.string().trim().max(1000).optional(),
});

//************************************************************** */
// Assign Repair Order To Service Bay

export const assignRepairOrderToServiceBaySchema = z.object({
  serviceBayId: z.string().trim().min(1, "Service bay ID is required."),

  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */
// Release Repair Order From Service Bay

export const releaseRepairOrderFromServiceBaySchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */
// Update Service Bay Status

export const updateServiceBayStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]),

  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export type UpdateServiceBayStatusInput = z.infer<
  typeof updateServiceBayStatusSchema
>;

//************************************************************** */

export type ReleaseRepairOrderFromServiceBayInput = z.infer<
  typeof releaseRepairOrderFromServiceBaySchema
>;

//************************************************************** */

export type AssignRepairOrderToServiceBayInput = z.infer<
  typeof assignRepairOrderToServiceBaySchema
>;

//************************************************************** */

export type CreateServiceBayInput = z.infer<typeof createServiceBaySchema>;
