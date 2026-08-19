import { z } from "zod";

import { repairOrderApprovalMethodSchema } from "./repair-order.schemas.js";

//************************************************************** */
// Request Additional Work Approval

export const requestAdditionalWorkApprovalSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(1, "A description of the additional work is required.")
    .max(5000),
});

//************************************************************** */
// Approve Additional Work

export const approveAdditionalWorkSchema = z.object({
  approvalMethod: repairOrderApprovalMethodSchema,

  approvedBy: z.string().trim().min(1, "Approved by is required.").max(200),

  approvedAmount: z.number().nonnegative().optional(),

  notes: z.string().trim().max(5000).optional(),
});

//************************************************************** */
// Decline Additional Work

export const declineAdditionalWorkSchema = z.object({
  notes: z.string().trim().min(1, "Decline notes are required.").max(5000),
});

//************************************************************** */

export type RequestAdditionalWorkApprovalInput = z.infer<
  typeof requestAdditionalWorkApprovalSchema
>;

export type ApproveAdditionalWorkInput = z.infer<
  typeof approveAdditionalWorkSchema
>;

export type DeclineAdditionalWorkInput = z.infer<
  typeof declineAdditionalWorkSchema
>;
