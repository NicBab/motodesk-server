//************************************************************** */
//************************************************************** */
// membership.service.ts
//   fetches data
//   calls policy
//   persists changes
//   maps DTOs
//************************************************************** */
//************************************************************** */

import { AppError } from "../../common/errors/app-error.js";
import { prisma } from "../../config/prisma.js";
import { assertMembershipUpdateAllowed } from "./membership.policy.js";
import {
  toMembershipListItem,
  toMembershipRecord,
} from "./membership.utils.js";

import type {
  MembershipActorContext,
  MembershipListItem,
  MembershipRecord,
  MembershipUpdateData,
} from "./membership.types.js";

//************************************************************** */

export async function listMemberships(
  organizationId: string,
): Promise<MembershipListItem[]> {
  const memberships =
    await prisma.membership.findMany({
      where: {
        organizationId,
      },
      include: {
        user: true,
        organization: true,
      },
      orderBy: [
        {
          createdAt: "asc",
        },
      ],
    });

  return memberships.map(
    toMembershipListItem,
  );
}

//************************************************************** */

export async function getMembershipById(
  organizationId: string,
  membershipId: string,
): Promise<MembershipRecord> {
  const membership = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
    },
    include: {
      user: true,
      organization: true,
    },
  });

  if (!membership) {
    throw new AppError(404, "Membership not found.", {
      code: "MEMBERSHIP_NOT_FOUND",
    });
  }

  return toMembershipRecord(membership);
}

//************************************************************** */

export async function updateMembership(
  organizationId: string,
  membershipId: string,
  actor: MembershipActorContext,
  data: MembershipUpdateData,
): Promise<MembershipRecord> {
  const existing =
    await prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId,
      },
    });

  if (!existing) {
    throw new AppError(
      404,
      "Membership not found.",
      {
        code: "MEMBERSHIP_NOT_FOUND",
      },
    );
  }

  const {
    roleChanged,
    statusChanged,
  } = assertMembershipUpdateAllowed(
    actor,
    existing,
    organizationId,
    data,
  );

  const membership =
    await prisma.membership.update({
      where: {
        id: membershipId,
      },
      data: {
        ...(roleChanged &&
        data.role !== undefined
          ? { role: data.role }
          : {}),
        ...(statusChanged &&
        data.status !== undefined
          ? { status: data.status }
          : {}),
      },
      include: {
        user: true,
        organization: true,
      },
    });

  return toMembershipRecord(
    membership,
  );
}

//************************************************************** */