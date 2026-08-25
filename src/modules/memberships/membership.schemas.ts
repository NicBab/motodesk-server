import { z } from "zod";

import {
  MembershipRole,
  MembershipStatus,
} from "../../generated/prisma/client.js";

import { paginationQuerySchema } from "../../platform/http/pagination.schema.js";

//************************************************************** */

export const createMembershipSchema = z.object({
  email: z.string().trim().email("A valid email address is required."),

  role: z.nativeEnum(MembershipRole),
});

//************************************************************** */

export const updateMembershipSchema = z.object({
  role: z.nativeEnum(MembershipRole).optional(),

  status: z.nativeEnum(MembershipStatus).optional(),
});

//************************************************************** */

export const membershipIdSchema = z.object({
  membershipId: z.string().trim().min(1, "Membership ID is required."),
});

//************************************************************** */

export const listMembershipsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(MembershipStatus).optional(),

  role: z.nativeEnum(MembershipRole).optional(),

  search: z.string().trim().min(1).optional(),
});

//************************************************************** */

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export type MembershipIdInput = z.infer<typeof membershipIdSchema>;

export type ListMembershipsQueryInput = z.infer<
  typeof listMembershipsQuerySchema
>;

//************************************************************** */
