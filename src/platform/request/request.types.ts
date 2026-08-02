import type {
  MembershipRole,
  MembershipStatus,
} from "../../generated/prisma/client.js";

//************************************************************** */

export interface RequestMembershipContext {
  id: string;
  organizationId: string;
  organizationName: string;

  role: MembershipRole;
  status: MembershipStatus;
}

//************************************************************** */

export interface RequestUserContext {
  id: string;

  email: string;

  firstName: string;
  lastName: string;

  phone: string | null;
}

//************************************************************** */

export interface RequestContext {
  requestId: string;

  sessionId: string;

  ipAddress: string | null;
  userAgent: string | null;

  user: RequestUserContext;

  membership: RequestMembershipContext | null;
}