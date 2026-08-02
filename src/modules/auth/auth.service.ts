// import { prisma } from "../../config/prisma.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import { AppError } from "../../platform/errors/app-error.js";
import { generateAccessToken, parseRefreshToken } from "./token.service.js";
import {
  MembershipStatus,
  SessionRevocationReason,
  type Membership,
  type Organization,
  type User,
} from "../../generated/prisma/client.js";

import type {
  LoginInput,
  LogoutInput,
  RefreshSessionInput,
  RegisterInput,
  SwitchOrganizationInput,
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
  rotateSessionToken,
  validateSession,
} from "./session.service.js";

import {
  createUserRecord,
  findUserForAuthentication,
  findUserForLogin,
  findUserForOrganizationSwitch,
  findUserIdByEmail,
} from "./auth.repository.js";


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

// Creates a database session.
// Generates the refresh token.
// Removes the password hash from the user response.
// Accepts only an active organization membership.
// Generates the short-lived JWT.
// Returns both tokens and their expiration dates.
// An invited or suspended membership does not enter the JWT:
// This prevents a non-active membership from accidentally granting organization access.

export async function createAuthenticationResult(
  user: UserWithPassword,
  membership: MembershipWithOrganization | null,
  context: RequestContext,
): Promise<AuthenticationResult> {
  const { session, refreshToken } = await createSession(user.id, context);

  const authenticatedUser = toAuthenticatedUser(user);

  const authenticatedMembership =
    membership?.status === MembershipStatus.ACTIVE
      ? toAuthenticatedMembership(membership)
      : null;

  const accessToken = generateAccessToken({
    sub: user.id,
    email: user.email,
    sessionId: session.id,
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

export async function registerUser(
  input: RegisterInput,
  context: RequestContext,
): Promise<AuthenticationResult> {
  const existingUser =
    await findUserIdByEmail(input.email);

  if (existingUser) {
    throw new AppError(
      409,
      "An account with this email address already exists.",
      {
        code: "EMAIL_ALREADY_REGISTERED",
      },
    );
  }

  const passwordHash =
    await hashPassword(input.password);

  const user = await createUserRecord({
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone ?? null,
  });

  // Registration creates only the user account.
  // Organization creation happens during onboarding.
  return createAuthenticationResult(
    user,
    null,
    context,
  );
}

//************************************************************** */

export async function loginUser(
  input: LoginInput,
  context: RequestContext,
): Promise<AuthenticationResult> {
  const user =
    await findUserForLogin(input.email);

  if (!user) {
    throw new AppError(
      401,
      "Invalid email address or password.",
      {
        code: "INVALID_CREDENTIALS",
      },
    );
  }

  if (!user.isActive) {
    throw new AppError(
      403,
      "This account is currently inactive.",
      {
        code: "ACCOUNT_INACTIVE",
      },
    );
  }

  const passwordMatches =
    await verifyPassword(
      input.password,
      user.passwordHash,
    );

  if (!passwordMatches) {
    throw new AppError(
      401,
      "Invalid email address or password.",
      {
        code: "INVALID_CREDENTIALS",
      },
    );
  }

  const membership =
    user.memberships[0] ?? null;

  return createAuthenticationResult(
    user,
    membership,
    context,
  );
}

//************************************************************** */

export async function refreshSession(
  input: RefreshSessionInput,
  _context: RequestContext,
): Promise<AuthenticationResult> {
  const parsedRefreshToken =
    parseRefreshToken(input.refreshToken);

  const validatedSession =
    await validateSession(
      parsedRefreshToken.sessionId,
      parsedRefreshToken.secret,
    );

  if (!validatedSession) {
    throw new AppError(
      401,
      "Session has expired or is invalid.",
      {
        code: "SESSION_INVALID",
      },
    );
  }

  const user =
    await findUserForAuthentication(
      validatedSession.session.userId,
    );

  if (!user) {
    throw new AppError(
      401,
      "The authenticated user no longer exists.",
      {
        code: "AUTHENTICATED_USER_NOT_FOUND",
      },
    );
  }

  if (!user.isActive) {
    throw new AppError(
      403,
      "This account is currently inactive.",
      {
        code: "ACCOUNT_INACTIVE",
      },
    );
  }

  const rotatedRefreshToken =
    await rotateSessionToken(
      validatedSession.session.id,
    );

  const membership =
    user.memberships[0] ?? null;

  const authenticatedUser =
    toAuthenticatedUser(user);

  const authenticatedMembership =
    membership
      ? toAuthenticatedMembership(
          membership,
        )
      : null;

  const accessToken =
    generateAccessToken({
      sub: user.id,
      email: user.email,
      sessionId:
        validatedSession.session.id,
      organizationId:
        authenticatedMembership
          ?.organizationId ?? null,
      membershipId:
        authenticatedMembership?.id ??
        null,
      role:
        authenticatedMembership?.role ??
        null,
    });

  return {
    user: authenticatedUser,
    membership:
      authenticatedMembership,
    accessToken: accessToken.token,
    refreshToken:
      rotatedRefreshToken.token,
    accessTokenExpiresAt:
      accessToken.expiresAt,
    refreshTokenExpiresAt:
      rotatedRefreshToken.expiresAt,
  };
}

//************************************************************** */

export async function switchOrganization(
  userId: string,
  sessionId: string,
  input: SwitchOrganizationInput,
): Promise<SwitchOrganizationResult> {
  const user =
    await findUserForOrganizationSwitch(
      userId,
      input.organizationId,
    );

  if (!user) {
    throw new AppError(
      401,
      "The authenticated user no longer exists.",
      {
        code: "AUTHENTICATED_USER_NOT_FOUND",
      },
    );
  }

  if (!user.isActive) {
    throw new AppError(
      403,
      "This account is currently inactive.",
      {
        code: "ACCOUNT_INACTIVE",
      },
    );
  }

  const membership =
    user.memberships[0] ?? null;

  if (!membership) {
    throw new AppError(
      403,
      "You do not have an active membership in this organization.",
      {
        code: "ORGANIZATION_MEMBERSHIP_REQUIRED",
      },
    );
  }

  const authenticatedMembership =
    toAuthenticatedMembership(
      membership,
    );

  const accessToken =
    generateAccessToken({
      sub: user.id,
      email: user.email,
      sessionId,
      organizationId:
        authenticatedMembership.organizationId,
      membershipId:
        authenticatedMembership.id,
      role:
        authenticatedMembership.role,
    });

  return {
    membership:
      authenticatedMembership,
    accessToken:
      accessToken.token,
    accessTokenExpiresAt:
      accessToken.expiresAt,
  };
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
