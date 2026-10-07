//************************************************************** 
// This reuses the existing password, session, token, and audit infrastructure. 
// Admin login and refresh require an active grant and verified email. 
// Logout verifies the admin refresh credential and remains available after a grant is revoked.*/

import {
  SessionAudience,
  SessionRevocationReason,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../platform/errors/app-error.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../audit/audit.constants.js";

import { createAuditLog } from "../audit/audit.service.js";

import type {
  AuthenticationResult,
  RequestMetadata,
} from "../auth/auth.types.js";

import type { LoginInput } from "../auth/authentication/login/schema.js";

import {
  findUserForLogin,
} from "../auth/shared/repositories/user-auth.repository.js";

import {
  findUserForAuthentication,
} from "../auth/authentication/refresh/repository.js";

import { verifyPassword } from "../auth/security/password.service.js";

import {
  buildAuthenticationResult,
  createAuthenticationResult,
} from "../auth/shared/authentication-result.builder.js";

import {
  revokeSession,
  rotateSessionToken,
  validateSession,
} from "../auth/sessions/session.service.js";

import {
  findSessionById,
} from "../auth/sessions/session.repository.js";

import {
  parseRefreshToken,
} from "../auth/tokens/refresh-token.service.js";

import { verifyTokenHash } from "../auth/tokens/token.crypto.js";

//************************************************************** */

const audience = SessionAudience.PLATFORM_ADMIN;

function buildAuditContext(context: RequestMetadata) {
  return {
    ...(context.ipAddress !== null
      ? { ipAddress: context.ipAddress }
      : {}),

    ...(context.userAgent !== null
      ? { userAgent: context.userAgent }
      : {}),
  };
}

function invalidCredentials(): AppError {
  return new AppError(401, "Invalid email address or password.", {
    code: "INVALID_CREDENTIALS",
  });
}

function invalidSession(): AppError {
  return new AppError(401, "Session has expired or is invalid.", {
    code: "SESSION_INVALID",
  });
}

//************************************************************** */

async function assertPlatformAccess(userId: string): Promise<void> {
  const grant = await prisma.platformAdmin.findUnique({
    where: {
      userId,
    },

    select: {
      isActive: true,

      user: {
        select: {
          isActive: true,
          emailVerifiedAt: true,
        },
      },
    },
  });

  if (!grant || !grant.isActive || !grant.user.isActive) {
    throw new AppError(
      403,
      "Platform administrator access is required.",
      {
        code: "PLATFORM_ADMIN_ACCESS_REQUIRED",
      },
    );
  }

  if (!grant.user.emailVerifiedAt) {
    throw new AppError(
      403,
      "Email verification is required for platform access.",
      {
        code: "PLATFORM_ADMIN_EMAIL_VERIFICATION_REQUIRED",
      },
    );
  }
}

//************************************************************** */

async function recordFailedLogin(
  userId: string,
  reason: string,
  context: RequestMetadata,
): Promise<void> {
  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,

    entityType: AUDIT_ENTITY_TYPES.USER,

    entityId: userId,

    actor: {
      userId,
    },

    context: buildAuditContext(context),

    metadata: {
      audience,
      reason,
    },
  });
}

//************************************************************** */

export async function loginPlatformAdmin(
  input: LoginInput,
  context: RequestMetadata,
): Promise<AuthenticationResult> {
  const user = await findUserForLogin(input.email);

  if (!user) {
    logger.warn("Platform authentication failed", {
      reason: "USER_NOT_FOUND",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    throw invalidCredentials();
  }

  if (!user.passwordHash) {
    await recordFailedLogin(
      user.id,
      "LOCAL_PASSWORD_UNAVAILABLE",
      context,
    );

    throw invalidCredentials();
  }

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    await recordFailedLogin(user.id, "INVALID_PASSWORD", context);

    throw invalidCredentials();
  }

  if (!user.isActive) {
    await recordFailedLogin(user.id, "ACCOUNT_INACTIVE", context);

    throw new AppError(403, "This account is currently inactive.", {
      code: "ACCOUNT_INACTIVE",
    });
  }

  try {
    await assertPlatformAccess(user.id);
  } catch (error) {
    if (error instanceof AppError) {
      await recordFailedLogin(
        user.id,
        "PLATFORM_ACCESS_DENIED",
        context,
      );
    }

    throw error;
  }

  const result = await createAuthenticationResult(
    user,
    null,
    context,
    audience,
  );

  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED,

    entityType: AUDIT_ENTITY_TYPES.USER,

    entityId: user.id,

    actor: {
      userId: user.id,
    },

    context: buildAuditContext(context),

    metadata: {
      audience,
      membershipId: null,
      sessionEstablished: true,
    },
  });

  return result;
}

//************************************************************** */

export async function refreshPlatformSession(
  refreshToken: string,
  context: RequestMetadata,
): Promise<AuthenticationResult> {
  const parsed = parseRefreshToken(refreshToken);

  const validated = await validateSession(
    parsed.sessionId,
    parsed.secret,
    audience,
  );

  if (!validated) {
    throw invalidSession();
  }

  const user = await findUserForAuthentication(
    validated.session.userId,
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
    throw new AppError(403, "This account is currently inactive.", {
      code: "ACCOUNT_INACTIVE",
    });
  }

  // Check current database access before consuming the refresh token.
  await assertPlatformAccess(user.id);

  const rotatedToken = await rotateSessionToken(
    validated.session.id,
    validated.session.tokenHash,
    audience,
  );

  if (!rotatedToken) {
    throw invalidSession();
  }

  const result = buildAuthenticationResult(
    user,
    null,
    validated.session.id,
    rotatedToken,
  );

  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_SESSION_REFRESHED,

    entityType: AUDIT_ENTITY_TYPES.SESSION,

    entityId: validated.session.id,

    actor: {
      userId: user.id,
      sessionId: validated.session.id,
    },

    context: buildAuditContext(context),

    metadata: {
      audience,
      membershipId: null,
      sessionRotated: true,
    },
  });

  return result;
}

//************************************************************** */

export async function logoutPlatformAdmin(
  refreshToken: string,
  context: RequestMetadata,
): Promise<void> {
  const parsed = parseRefreshToken(refreshToken);

  const session = await findSessionById(parsed.sessionId);

  if (!session || session.audience !== audience) {
    throw invalidSession();
  }

  const currentTokenMatches = verifyTokenHash(
    parsed.secret,
    session.tokenHash,
  );

  const previousTokenMatches =
    session.previousTokenHash !== null &&
    verifyTokenHash(parsed.secret, session.previousTokenHash);

  if (!currentTokenMatches && !previousTokenMatches) {
    throw invalidSession();
  }

  // Logout is idempotent and does not require an active admin grant.
  if (session.revokedAt !== null) {
    return;
  }

  await revokeSession(session.id, SessionRevocationReason.LOGOUT);

  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_LOGOUT,

    entityType: AUDIT_ENTITY_TYPES.SESSION,

    entityId: session.id,

    actor: {
      userId: session.userId,
      sessionId: session.id,
    },

    context: buildAuditContext(context),

    metadata: {
      audience,
      scope: "CURRENT_SESSION",
    },
  });
}

//************************************************************** */