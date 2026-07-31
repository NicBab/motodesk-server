import { AppError } from "../../common/errors/app-error.js";
import { assertMembershipUpdateAllowed } from "./membership.policy.js";
import {
  findMembershipById,
  findMembershipForUpdate,
  findMembershipsByOrganization,
  updateMembershipRecord,
} from "./membership.repository.js";
import type {
  MembershipActorContext,
  MembershipListItem,
  MembershipRecord,
  MembershipUpdateData,
} from "./membership.types.js";
import {
  toMembershipListItem,
  toMembershipRecord,
} from "./membership.utils.js";

//************************************************************** */

export async function listMemberships(
  organizationId: string,
): Promise<MembershipListItem[]> {
  const memberships =
    await findMembershipsByOrganization(
      organizationId,
    );

  return memberships.map(
    toMembershipListItem,
  );
}

//************************************************************** */

export async function getMembershipById(
  organizationId: string,
  membershipId: string,
): Promise<MembershipRecord> {
  const membership =
    await findMembershipById(
      organizationId,
      membershipId,
    );

  if (!membership) {
    throw new AppError(
      404,
      "Membership not found.",
      {
        code: "MEMBERSHIP_NOT_FOUND",
      },
    );
  }

  return toMembershipRecord(
    membership,
  );
}

//************************************************************** */

export async function updateMembership(
  organizationId: string,
  membershipId: string,
  actor: MembershipActorContext,
  data: MembershipUpdateData,
): Promise<MembershipRecord> {
  const existing =
    await findMembershipForUpdate(
      organizationId,
      membershipId,
    );

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
    await updateMembershipRecord(
      membershipId,
      {
        ...(roleChanged &&
        data.role !== undefined
          ? {
              role: data.role,
            }
          : {}),

        ...(statusChanged &&
        data.status !== undefined
          ? {
              status: data.status,
            }
          : {}),
      },
    );

  return toMembershipRecord(
    membership,
  );
}