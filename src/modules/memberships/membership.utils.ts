import type {
  Membership,
  Organization,
  User,
} from "../../generated/prisma/client.js";
import type {
  MembershipListItem,
  MembershipRecord,
} from "./membership.types.js";

//************************************************************** */

type MembershipWithRelations = Membership & {
  user: User;
  organization: Organization;
};

//************************************************************** */

export function toMembershipRecord(
  membership: MembershipWithRelations,
): MembershipRecord {
  return {
    id: membership.id,
    role: membership.role,
    status: membership.status,
    userId: membership.userId,
    organizationId: membership.organizationId,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
    user: {
      id: membership.user.id,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      phone: membership.user.phone,
      isActive: membership.user.isActive,
    },
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
    },
  };
}

//************************************************************** */

export function toMembershipListItem(
  membership: MembershipWithRelations,
): MembershipListItem {
  return {
    id: membership.id,
    role: membership.role,
    status: membership.status,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
    user: {
      id: membership.user.id,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      phone: membership.user.phone,
      isActive: membership.user.isActive,
    },
  };
}