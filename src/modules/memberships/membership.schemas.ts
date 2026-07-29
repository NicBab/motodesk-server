import { z } from "zod";

import {
  MembershipRole,
  MembershipStatus,
} from "../../generated/prisma/client.js";

//************************************************************** */

export const updateMembershipSchema = z.object({
  role: z.nativeEnum(MembershipRole).optional(),
  status: z.nativeEnum(MembershipStatus).optional(),
});

//************************************************************** */

export const membershipIdSchema = z.object({
  membershipId: z
    .string()
    .trim()
    .min(1, "Membership ID is required."),
});

//************************************************************** */

export type UpdateMembershipInput = z.infer<
  typeof updateMembershipSchema
>;

export type MembershipIdInput = z.infer<
  typeof membershipIdSchema
>;