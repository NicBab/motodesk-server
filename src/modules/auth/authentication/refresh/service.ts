import { AppError } from "../../../../platform/errors/app-error.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../audit/audit.constants.js";

import {
  createAuditLog,
} from "../../../audit/audit.service.js";

import { findUserForAuthentication } from "./repository.js";

import { parseRefreshToken } from "../../tokens/refresh-token.service.js";

import { generateAccessToken } from "../../tokens/jwt.service.js";

import {
  rotateSessionToken,
  validateSession,
} from "../../sessions/session.service.js";

import { toAuthenticatedMembership } from "../../shared/mappers/membership.mapper.js";

import { toAuthenticatedUser } from "../../shared/mappers/auth.mapper.js";

import type {
  AuthenticationResult,
  RequestMetadata,
} from "../../auth.types.js";

//************************************************************** */

function buildAuditContext(
  context: RequestMetadata,
) {
  return {
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
  };
}

//************************************************************** */

export async function refreshSession(
  refreshToken: string,
  context: RequestMetadata,
): Promise<AuthenticationResult> {
  const parsedRefreshToken =
    parseRefreshToken(
      refreshToken,
    );

  const validatedSession =
    await validateSession(
      parsedRefreshToken.sessionId,
      parsedRefreshToken.secret,
    );

  if (
    !validatedSession
  ) {
    throw new AppError(
      401,
      "Session has expired or is invalid.",
      {
        code:
          "SESSION_INVALID",
      },
    );
  }

  //************************************************************** */

  const user =
    await findUserForAuthentication(
      validatedSession.session.userId,
    );

  if (
    !user
  ) {
    throw new AppError(
      401,
      "The authenticated user no longer exists.",
      {
        code:
          "AUTHENTICATED_USER_NOT_FOUND",
      },
    );
  }

  if (
    !user.isActive
  ) {
    throw new AppError(
      403,
      "This account is currently inactive.",
      {
        code:
          "ACCOUNT_INACTIVE",
      },
    );
  }

  //************************************************************** */
  // Rotate the refresh credential before recording a successful
  // refresh event. If rotation loses a race or otherwise fails, the
  // operation was not successful and must not be audited as one.

  const rotatedRefreshToken =
    await rotateSessionToken(
      validatedSession.session.id,
      validatedSession.session.tokenHash,
    );

  if (
    !rotatedRefreshToken
  ) {
    throw new AppError(
      401,
      "Session has expired or is invalid.",
      {
        code:
          "SESSION_INVALID",
      },
    );
  }

  //************************************************************** */

  const membership =
    user.memberships[0] ??
    null;

  const authenticatedUser =
    toAuthenticatedUser(
      user,
    );

  const authenticatedMembership =
    membership
      ? toAuthenticatedMembership(
          membership,
        )
      : null;

  const accessToken =
    generateAccessToken({
      sub:
        user.id,

      email:
        user.email,

      sessionId:
        validatedSession.session.id,

      organizationId:
        authenticatedMembership
          ?.organizationId ??
        null,

      membershipId:
        authenticatedMembership
          ?.id ??
        null,

      role:
        authenticatedMembership
          ?.role ??
        null,
    });

  //************************************************************** */
  // Persist evidence only after the refresh-token rotation and new
  // access-token generation have completed successfully.
  //
  // Never place either token value or token hash in audit metadata.

  await createAuditLog({
    action:
      AUDIT_ACTIONS.AUTH_SESSION_REFRESHED,

    entityType:
      AUDIT_ENTITY_TYPES.SESSION,

    entityId:
      validatedSession.session.id,

    actor: {
      userId:
        user.id,

      sessionId:
        validatedSession.session.id,

      ...(authenticatedMembership
        ? {
            organizationId:
              authenticatedMembership.organizationId,
          }
        : {}),
    },

    context:
      buildAuditContext(
        context,
      ),

    metadata: {
      membershipId:
        authenticatedMembership
          ?.id ??
        null,

      sessionRotated:
        true,
    },
  });

  //************************************************************** */

  return {
    user:
      authenticatedUser,

    membership:
      authenticatedMembership,

    accessToken:
      accessToken.token,

    refreshToken:
      rotatedRefreshToken.token,

    accessTokenExpiresAt:
      accessToken.expiresAt,

    refreshTokenExpiresAt:
      rotatedRefreshToken.expiresAt,
  };
}

//************************************************************** */
