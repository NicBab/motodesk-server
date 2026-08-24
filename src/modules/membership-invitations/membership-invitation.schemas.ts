import { z } from "zod";

import {
  MembershipRole,
} from "../../generated/prisma/client.js";

//************************************************************** */

export const createMembershipInvitationSchema =
  z.object({
    email: z
      .string()
      .trim()
      .email(
        "A valid email address is required.",
      ),

    role: z.nativeEnum(
      MembershipRole,
    ),
  });

//************************************************************** */

export const acceptMembershipInvitationSchema =
  z.object({
    token: z
      .string()
      .trim()
      .min(
        1,
        "Invitation token is required.",
      ),
  });

//************************************************************** */

export const membershipInvitationIdSchema =
  z.object({
    invitationId: z
      .string()
      .trim()
      .min(
        1,
        "Invitation ID is required.",
      ),
  });

//************************************************************** */

export type CreateMembershipInvitationInput =
  z.infer<
    typeof createMembershipInvitationSchema
  >;

export type AcceptMembershipInvitationInput =
  z.infer<
    typeof acceptMembershipInvitationSchema
  >;

export type MembershipInvitationIdInput =
  z.infer<
    typeof membershipInvitationIdSchema
  >;

//************************************************************** */