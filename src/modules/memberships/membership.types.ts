import type {
  MembershipRole,
  MembershipStatus,
} from "../../generated/prisma/client.js";

//************************************************************** */

export type MembershipUserSummary = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
};

//************************************************************** */

export type MembershipOrganizationSummary = {
  id: string;
  name: string;
  slug: string;
};

//************************************************************** */

export type MembershipRecord = {
  id: string;
  role: MembershipRole;
  status: MembershipStatus;
  userId: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  user: MembershipUserSummary;
  organization: MembershipOrganizationSummary;
};

//************************************************************** */

export type MembershipListItem = {
  id: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
  user: MembershipUserSummary;
};

//************************************************************** */

export type MembershipUpdateData = {
  role?: MembershipRole;
  status?: MembershipStatus;
};

//************************************************************** */

export interface MembershipActorContext {
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
}

//************************************************************** */