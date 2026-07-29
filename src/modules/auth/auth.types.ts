import type {
  MembershipRole,
  MembershipStatus,
} from "../../generated/prisma/client.js";

//************************************************************** */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  sessionId: string;
  organizationId: string | null;
  membershipId: string | null;
  role: MembershipRole | null;
}

//************************************************************** */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
}

//************************************************************** */
export interface AuthenticatedMembership {
  id: string;
  organizationId: string;
  organizationName: string;
  role: MembershipRole;
  status: MembershipStatus;
}

//************************************************************** */
export interface AuthenticationResult {
  user: AuthenticatedUser;
  membership: AuthenticatedMembership | null;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

//************************************************************** */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

//************************************************************** */
export interface RefreshTokenParts {
  sessionId: string;
  secret: string;
}

//************************************************************** */
