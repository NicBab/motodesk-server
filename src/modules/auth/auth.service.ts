import {
  parseRefreshToken,
  type GeneratedRefreshToken,
} from "./tokens/refresh-token.service.js";

import {
  MembershipStatus,
  SessionRevocationReason,
  type Membership,
  type Organization,
  type User,
} from "../../generated/prisma/client.js";

import type {
  LogoutInput,
} from "./auth.schemas.js";

import type {
  AuthenticatedMembership,
  AuthenticatedUser,
  AuthenticationResult,
  RequestContext,
} from "./auth.types.js";

import {
  createSession,
  revokeSession,
  revokeUserSessions,
} from "./session.service.js";

import { generateAccessToken } from "./tokens/jwt.service.js";

//************************************************************** */

type UserWithPassword = Pick<
  User,
  | "id"
  | "email"
  | "passwordHash"
  | "firstName"
  | "lastName"
  | "phone"
  | "isActive"
>;

type MembershipWithOrganization = Pick<
  Membership,
  "id" | "organizationId" | "role" | "status"
> & {
  organization: Pick<Organization, "name">;
};

type SwitchOrganizationResult = {
  membership: AuthenticatedMembership;
  accessToken: string;
  accessTokenExpiresAt: Date;
};

//************************************************************** */

export const authenticationUserSelect = {
  id: true,
  email: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
} as const;

export const authenticationMembershipSelect = {
  id: true,
  organizationId: true,
  role: true,
  status: true,
  organization: {
    select: {
      name: true,
    },
  },
} as const;

//************************************************************** */

export function toAuthenticatedUser(user: UserWithPassword): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    isActive: user.isActive,
  };
}

//************************************************************** */

export function toAuthenticatedMembership(
  membership: MembershipWithOrganization,
): AuthenticatedMembership {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
    status: membership.status,
  };
}

//************************************************************** */

export function buildAuthenticationResult(
  user: UserWithPassword,
  membership: MembershipWithOrganization | null,
  sessionId: string,
  refreshToken: GeneratedRefreshToken,
): AuthenticationResult {
  const authenticatedUser = toAuthenticatedUser(user);

  const authenticatedMembership =
    membership?.status === MembershipStatus.ACTIVE
      ? toAuthenticatedMembership(membership)
      : null;

  const accessToken = generateAccessToken({
    sub: user.id,
    email: user.email,
    sessionId,
    organizationId: authenticatedMembership?.organizationId ?? null,
    membershipId: authenticatedMembership?.id ?? null,
    role: authenticatedMembership?.role ?? null,
  });

  return {
    user: authenticatedUser,
    membership: authenticatedMembership,
    accessToken: accessToken.token,
    refreshToken: refreshToken.token,
    accessTokenExpiresAt: accessToken.expiresAt,
    refreshTokenExpiresAt: refreshToken.expiresAt,
  };
}

//************************************************************** */

export async function createAuthenticationResult(
  user: UserWithPassword,
  membership: MembershipWithOrganization | null,
  context: RequestContext,
): Promise<AuthenticationResult> {
  const { session, refreshToken } = await createSession(user.id, context);

  return buildAuthenticationResult(user, membership, session.id, refreshToken);
}

//************************************************************** */


export async function logoutUser(input: LogoutInput): Promise<void> {
  const parsedRefreshToken = parseRefreshToken(input.refreshToken);

  await revokeSession(
    parsedRefreshToken.sessionId,
    SessionRevocationReason.LOGOUT,
  );
}

//************************************************************** */

export async function logoutAllUserSessions(userId: string): Promise<number> {
  const result = await revokeUserSessions(
    userId,
    SessionRevocationReason.LOGOUT_ALL,
  );

  return result.revokedSessionCount;
}

//************************************************************** */
