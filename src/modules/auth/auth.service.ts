// import { prisma } from "../../config/prisma.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import { AppError } from "../../platform/errors/app-error.js";
import { randomUUID } from "node:crypto";
import { createAuditLog } from "../audit/audit.service.js";
import { env } from "../../config/env.js";

import {
  generateAccessToken,
  generateRefreshToken,
  parseRefreshToken,
  type GeneratedRefreshToken,
} from "./token.service.js";

import {
  MembershipStatus,
  SessionRevocationReason,
  type Membership,
  type Organization,
  type User,
} from "../../generated/prisma/client.js";

import type {
  ChangePasswordInput,
  LoginInput,
  LogoutInput,
  RefreshSessionInput,
  RegisterInput,
  SwitchOrganizationInput,
  // UpdateProfileInput,
  ChangeEmailInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
} from "./auth.schemas.js";

import {
  consumePasswordResetAuthToken,
  createPasswordResetAuthToken,
  validatePasswordResetAuthToken,
} from "./auth-token.service.js";

import type {
  AuthenticatedMembership,
  AuthenticatedUser,
  AuthenticationResult,
  RequestContext,
  ChangePasswordResult,
} from "./auth.types.js";

import {
  createSession,
  revokeSession,
  revokeUserSessions,
  rotateSessionToken,
  validateSession,
  revokeAllUserSessions,
} from "./session.service.js";

import {
  createRegistrationRecords,
  findUserForAuthentication,
  findUserForLogin,
  findUserForOrganizationSwitch,
  findUserIdByEmail,
  findUserPasswordById,
  updateUserPasswordHash,
  // updateUserProfileRecord,
  findUserEmailById,
  updateUserEmailRecord,
} from "./auth.repository.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../audit/audit.constants.js";




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

//************************************************************** */

function buildAuthenticationResult(
  user: UserWithPassword,
  membership: MembershipWithOrganization | null,
  sessionId: string,
  refreshToken: GeneratedRefreshToken,
): AuthenticationResult {
  const authenticatedUser =
    toAuthenticatedUser(user);

  const authenticatedMembership =
    membership?.status ===
    MembershipStatus.ACTIVE
      ? toAuthenticatedMembership(
          membership,
        )
      : null;

  const accessToken =
    generateAccessToken({
      sub: user.id,
      email: user.email,
      sessionId,
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
    refreshToken: refreshToken.token,
    accessTokenExpiresAt:
      accessToken.expiresAt,
    refreshTokenExpiresAt:
      refreshToken.expiresAt,
  };
}

//************************************************************** */

export async function createAuthenticationResult(
  user: UserWithPassword,
  membership:
    | MembershipWithOrganization
    | null,
  context: RequestContext,
): Promise<AuthenticationResult> {
  const {
    session,
    refreshToken,
  } = await createSession(
    user.id,
    context,
  );

  return buildAuthenticationResult(
    user,
    membership,
    session.id,
    refreshToken,
  );
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

  const sessionId = randomUUID();

  const refreshToken =
    generateRefreshToken(sessionId);

  const records =
    await createRegistrationRecords({
      user: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
      },

      session: {
        id: sessionId,
        tokenHash: refreshToken.tokenHash,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt: refreshToken.expiresAt,
      },

      ...(input.organization !== undefined
        ? {
            organization: {
              name: input.organization.name,
              slug: input.organization.slug,

              ...(input.organization.email !== undefined
                ? {
                    email: input.organization.email,
                  }
                : {}),

              ...(input.organization.phone !== undefined
                ? {
                    phone: input.organization.phone,
                  }
                : {}),
            },
          }
        : {}),
    });

  return buildAuthenticationResult(
    records.user,
    records.membership,
    records.session.id,
    refreshToken,
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

export async function changePassword(
  userId: string,
  currentSessionId: string,
  input: ChangePasswordInput,
  context: RequestContext,
): Promise<ChangePasswordResult> {
  const user =
    await findUserPasswordById(userId);

  if (!user) {
    throw new AppError(
      404,
      "User account not found.",
      {
        code: "USER_NOT_FOUND",
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

  const currentPasswordMatches =
    await verifyPassword(
      input.currentPassword,
      user.passwordHash,
    );

  if (!currentPasswordMatches) {
    throw new AppError(
      401,
      "Current password is incorrect.",
      {
        code: "CURRENT_PASSWORD_INCORRECT",
      },
    );
  }

  const newPasswordMatchesCurrent =
    await verifyPassword(
      input.newPassword,
      user.passwordHash,
    );

  if (newPasswordMatchesCurrent) {
    throw new AppError(
      400,
      "The new password must be different from the current password.",
      {
        code:
          "NEW_PASSWORD_MUST_BE_DIFFERENT",
      },
    );
  }

  const newPasswordHash =
    await hashPassword(
      input.newPassword,
    );

  await updateUserPasswordHash(
    userId,
    newPasswordHash,
  );

  const revokedSessions =
    await revokeUserSessions(
      userId,
      SessionRevocationReason.PASSWORD_CHANGED,
      currentSessionId,
    );

  await createAuditLog({
    action:
      AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
    entityType:
      AUDIT_ENTITY_TYPES.USER,
    entityId: userId,
    actor: {
      userId,
      sessionId: currentSessionId,
    },
    context: {
      ...(context.ipAddress !== null
        ? {
            ipAddress:
              context.ipAddress,
          }
        : {}),
      ...(context.userAgent !== null
        ? {
            userAgent:
              context.userAgent,
          }
        : {}),
    },
    metadata: {
      revokedSessionCount:
        revokedSessions.revokedSessionCount,
    },
  });

  return {
    revokedSessionCount:
      revokedSessions.revokedSessionCount,
  };
}

//************************************************************** */

export interface RequestPasswordResetResult {
  message: string;

  // Development-only delivery until email service is implemented.
  resetToken?: string;
  expiresAt?: Date;
}

//************************************************************** */

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
  context: RequestContext,
): Promise<RequestPasswordResetResult> {
  const user =
    await findUserForLogin(input.email);

  const genericMessage =
    "If an account exists for this email address, password reset instructions have been sent.";

  if (!user || !user.isActive) {
    return {
      message: genericMessage,
    };
  }

  const resetToken =
    await createPasswordResetAuthToken(
      user.id,
    );

  await createAuditLog({
    action:
      AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED,
    entityType:
      AUDIT_ENTITY_TYPES.USER,
    entityId: user.id,
    actor: {
      userId: user.id,
    },
    context: {
      ...(context.ipAddress !== null
        ? {
            ipAddress:
              context.ipAddress,
          }
        : {}),

      ...(context.userAgent !== null
        ? {
            userAgent:
              context.userAgent,
          }
        : {}),
    },
  });

  return {
    message: genericMessage,

    ...(env.NODE_ENV === "development"
      ? {
          resetToken: resetToken.token,
          expiresAt:
            resetToken.expiresAt,
        }
      : {}),
  };
}

//************************************************************** */

export async function resetPassword(
  input: ResetPasswordInput,
  context: RequestContext,
): Promise<void> {
  const authToken =
    await validatePasswordResetAuthToken(
      input.token,
    );

  if (!authToken) {
    throw new AppError(
      400,
      "Password reset token is invalid or expired.",
      {
        code:
          "PASSWORD_RESET_TOKEN_INVALID",
      },
    );
  }

  const newPasswordHash =
    await hashPassword(
      input.password,
    );

  await updateUserPasswordHash(
    authToken.userId,
    newPasswordHash,
  );

  await consumePasswordResetAuthToken(
    authToken.id,
  );

  await revokeAllUserSessions(
    authToken.userId,
    SessionRevocationReason.PASSWORD_RESET,
  );

  await createAuditLog({
    action:
      AUDIT_ACTIONS.AUTH_PASSWORD_RESET_COMPLETED,
    entityType:
      AUDIT_ENTITY_TYPES.USER,
    entityId:
      authToken.userId,
    actor: {
      userId:
        authToken.userId,
    },
    context: {
      ...(context.ipAddress !== null
        ? {
            ipAddress:
              context.ipAddress,
          }
        : {}),

      ...(context.userAgent !== null
        ? {
            userAgent:
              context.userAgent,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function changeEmail(
  userId: string,
  sessionId: string,
  input: ChangeEmailInput,
  context: RequestContext,
): Promise<AuthenticatedUser> {
  const user =
    await findUserEmailById(userId);

  if (!user) {
    throw new AppError(
      404,
      "User account not found.",
      {
        code: "USER_NOT_FOUND",
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
      input.currentPassword,
      user.passwordHash,
    );

  if (!passwordMatches) {
    throw new AppError(
      401,
      "Current password is incorrect.",
      {
        code: "CURRENT_PASSWORD_INCORRECT",
      },
    );
  }

  if (input.newEmail === user.email) {
    throw new AppError(
      400,
      "The new email address must be different from the current email address.",
      {
        code: "NEW_EMAIL_MUST_BE_DIFFERENT",
      },
    );
  }

  const existingUser =
    await findUserIdByEmail(
      input.newEmail,
    );

  if (existingUser) {
    throw new AppError(
      409,
      "An account with this email address already exists.",
      {
        code: "EMAIL_ALREADY_REGISTERED",
      },
    );
  }

  const updatedUser =
    await updateUserEmailRecord(
      userId,
      input.newEmail,
    );

  await createAuditLog({
    action:
      AUDIT_ACTIONS.AUTH_EMAIL_CHANGED,
    entityType:
      AUDIT_ENTITY_TYPES.USER,
    entityId: userId,
    actor: {
      userId,
      sessionId,
    },
    context: {
      ...(context.ipAddress !== null
        ? {
            ipAddress:
              context.ipAddress,
          }
        : {}),
      ...(context.userAgent !== null
        ? {
            userAgent:
              context.userAgent,
          }
        : {}),
    },
    metadata: {
      previousEmail: user.email,
      newEmail: updatedUser.email,
    },
  });

  return toAuthenticatedUser(
    updatedUser,
  );
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
