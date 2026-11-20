
import {
  authenticationMembershipSelect,
  authenticationUserSelect,
} from "../../shared/repositories/user-auth.repository.js";

import {
  MembershipStatus,
} from "../../../../generated/prisma/client.js";

import { prisma } from "../../../../config/prisma.js";

//************************************************************** */

export async function findUserForAuthentication(
  userId: string,
  activeOrganizationId: string | null = null,
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      ...authenticationUserSelect,
      memberships: {
        where: {
          status: MembershipStatus.ACTIVE,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: authenticationMembershipSelect,
      },
    },
  });

  if (!user) {
    return null;
  }

  // Prefer the organization persisted in the current session,
  // provided the user still has an active membership.

  const selectedMembership =
    activeOrganizationId !== null
      ? user.memberships.find(
          (membership) =>
            membership.organizationId === activeOrganizationId,
        )
      : undefined;

  // Preserve the existing oldest-active-membership fallback
  // for legacy sessions or memberships that are no longer active.

  const membership =
    selectedMembership ??
    user.memberships[0] ??
    null;

  return {
    ...user,

    memberships: membership
      ? [membership]
      : [],
  };
}

//************************************************************** */
