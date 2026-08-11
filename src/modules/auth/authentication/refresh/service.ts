import { AppError } from "../../../../platform/errors/app-error.js";

import { findUserForAuthentication } from "../../auth.repository.js";

import { parseRefreshToken } from "../../tokens/refresh-token.service.js";

import { generateAccessToken } from "../../tokens/jwt.service.js";

import { rotateSessionToken, validateSession } from "../../session.service.js";

import { toAuthenticatedMembership } from "../../auth.service.js";

import { toAuthenticatedUser } from "../../shared/mappers/auth.mapper.js";

import type { RefreshSessionInput } from "./schema.js";

import type { AuthenticationResult, RequestContext } from "../../auth.types.js";

//************************************************************** */

export async function refreshSession(
  input: RefreshSessionInput,
  _context: RequestContext,
): Promise<AuthenticationResult> {
  const parsedRefreshToken = parseRefreshToken(input.refreshToken);

  const validatedSession = await validateSession(
    parsedRefreshToken.sessionId,
    parsedRefreshToken.secret,
  );

  if (!validatedSession) {
    throw new AppError(401, "Session has expired or is invalid.", {
      code: "SESSION_INVALID",
    });
  }

  const user = await findUserForAuthentication(validatedSession.session.userId);

  if (!user) {
    throw new AppError(401, "The authenticated user no longer exists.", {
      code: "AUTHENTICATED_USER_NOT_FOUND",
    });
  }

  if (!user.isActive) {
    throw new AppError(403, "This account is currently inactive.", {
      code: "ACCOUNT_INACTIVE",
    });
  }

  const rotatedRefreshToken = await rotateSessionToken(
    validatedSession.session.id,
  );

  const membership = user.memberships[0] ?? null;

  const authenticatedUser = toAuthenticatedUser(user);

  const authenticatedMembership = membership
    ? toAuthenticatedMembership(membership)
    : null;

  const accessToken = generateAccessToken({
    sub: user.id,
    email: user.email,
    sessionId: validatedSession.session.id,
    organizationId: authenticatedMembership?.organizationId ?? null,
    membershipId: authenticatedMembership?.id ?? null,
    role: authenticatedMembership?.role ?? null,
  });

  return {
    user: authenticatedUser,
    membership: authenticatedMembership,
    accessToken: accessToken.token,
    refreshToken: rotatedRefreshToken.token,
    accessTokenExpiresAt: accessToken.expiresAt,
    refreshTokenExpiresAt: rotatedRefreshToken.expiresAt,
  };
}

//************************************************************** */
