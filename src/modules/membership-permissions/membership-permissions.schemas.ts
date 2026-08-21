import { z } from "zod";

export const updateMembershipPermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)),
});

export type UpdateMembershipPermissionsInput = z.infer<
  typeof updateMembershipPermissionsSchema
>;