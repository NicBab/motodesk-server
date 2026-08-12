import {
  type GeneratedRefreshToken,
} from "../tokens/refresh-token.service.js";

import {
  MembershipStatus,
  type Membership,
  type Organization,
} from "../../../generated/prisma/client.js";

import type {
  AuthenticationResult,
  RequestMetadata,
} from "../auth.types.js";

import {
  createSession,
} from "../sessions/session.service.js";

import { generateAccessToken } from "../tokens/jwt.service.js";

import {
  toAuthenticatedMembership,
} from "../shared/mappers/membership.mapper.js";

import {
  toAuthenticatedUser,
  type UserWithPassword,
} from "../shared/mappers/auth.mapper.js";

//************************************************************** */

type MembershipWithOrganization = Pick<
  Membership,
  "id" | "organizationId" | "role" | "status"
> & {
  organization: Pick<Organization, "name">;
};


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
  context: RequestMetadata,
): Promise<AuthenticationResult> {
  const { session, refreshToken } = await createSession(user.id, context);

  return buildAuthenticationResult(user, membership, session.id, refreshToken);
}

//************************************************************** */

