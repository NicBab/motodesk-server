import type { Request, Response } from "express";
import type { RequestContext } from "./auth.types.js";
import type { AuthenticatedRequest } from "./auth.middleware.js";
import { getPermissionsForRole } from "../permissions/permission.utils.js";
import { created, ok } from "../../platform/http/api-response.js";
import { AppError } from "../../platform/errors/app-error.js";
import { requireValidatedBody } from "../../platform/validation/validated-request.js";

import {
  clearAuthenticationCookies,
  setAccessTokenCookie,
  setAuthenticationCookies,
} from "./cookie.service.js";

import {
  loginUser,
  logoutAllUserSessions,
  logoutUser,
  refreshSession,
  registerUser,
  switchOrganization,
  changePassword,
  updateProfile,
  changeEmail,
  requestPasswordReset,
  resetPassword,
} from "./auth.service.js";

import type {
  LoginInput,
  LogoutInput,
  RefreshSessionInput,
  RegisterInput,
  SwitchOrganizationInput,
  ChangePasswordInput,
  UpdateProfileInput,
  ChangeEmailInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
} from "./auth.schemas.js";

//************************************************************** */

function getRequestContext(request: Request): RequestContext {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.get("user-agent") ?? null,
  };
}

//************************************************************** */

export async function register(
  request: Request,
  response: Response,
): Promise<void> {
  const input =
    requireValidatedBody<RegisterInput>(
      request,
    );

  const result = await registerUser(
    input,
    getRequestContext(request),
  );
  setAuthenticationCookies(response, result.accessToken, result.refreshToken);

  const permissions = result.membership
    ? getPermissionsForRole(result.membership.role)
    : [];

  created(response, {
    user: result.user,
    membership: result.membership,
    permissions,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}

//************************************************************** */

export async function login(
  request: Request,
  response: Response,
): Promise<void> {
  const input =
  requireValidatedBody<LoginInput>(
    request,
  );

  const result = await loginUser(input, getRequestContext(request));

  setAuthenticationCookies(response, result.accessToken, result.refreshToken);

  const permissions = result.membership
    ? getPermissionsForRole(result.membership.role)
    : [];

  ok(response, {
    user: result.user,
    membership: result.membership,
    permissions,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}

//************************************************************** */

export async function refresh(
  request: Request,
  response: Response,
): Promise<void> {
 const input =
  requireValidatedBody<RefreshSessionInput>(
    request,
  );

  const result = await refreshSession(input, getRequestContext(request));

  setAuthenticationCookies(response, result.accessToken, result.refreshToken);

  const permissions = result.membership
    ? getPermissionsForRole(result.membership.role)
    : [];

  ok(response, {
    user: result.user,
    membership: result.membership,
    permissions,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}

//************************************************************** */

export async function switchOrganizationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  const sessionId = request.authenticationSessionId;

  if (!userId || !sessionId) {
    throw new AppError(401, "Authentication required.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

const input =
  requireValidatedBody<SwitchOrganizationInput>(
    request,
  );

  const result = await switchOrganization(userId, sessionId, input);

  setAccessTokenCookie(response, result.accessToken);

  const permissions = getPermissionsForRole(result.membership.role);

  ok(response, {
    membership: result.membership,
    permissions,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
  });
}

//************************************************************** */

export async function changePasswordHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId =
    request.authenticatedUser?.id;

  const sessionId =
    request.authenticationSessionId;

  if (!userId || !sessionId) {
    throw new AppError(
      401,
      "Authentication required.",
      {
        code: "AUTHENTICATION_REQUIRED",
      },
    );
  }

  const input =
    requireValidatedBody<ChangePasswordInput>(
      request,
    );

  const result =
    await changePassword(
      userId,
      sessionId,
      input,
      getRequestContext(request),
    );

  ok(response, {
    message:
      "Password changed successfully.",
    revokedSessionCount:
      result.revokedSessionCount,
  });
}

//************************************************************** */

export async function requestPasswordResetHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const input =
    requireValidatedBody<RequestPasswordResetInput>(
      request,
    );

  const result =
    await requestPasswordReset(
      input,
      getRequestContext(request),
    );

  ok(response, result);
}

//************************************************************** */

export async function resetPasswordHandler(
  request: Request,
  response: Response,
): Promise<void> {
  const input =
    requireValidatedBody<ResetPasswordInput>(
      request,
    );

  await resetPassword(
    input,
    getRequestContext(request),
  );

  ok(response, {
    message:
      "Password reset successfully.",
  });
}

//************************************************************** */

export async function logout(
  request: Request,
  response: Response,
): Promise<void> {
const input =
  requireValidatedBody<LogoutInput>(
    request,
  );

  await logoutUser(input);

  clearAuthenticationCookies(response);

  ok(response, {
    message: "Logged out successfully.",
  });
}

//************************************************************** */

export async function logoutAll(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  if (!userId) {
    throw new AppError(401, "Authentication required.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const revokedSessionCount = await logoutAllUserSessions(userId);

  clearAuthenticationCookies(response);

  ok(response, {
    revokedSessionCount,
  });
}

//************************************************************** */

export async function me(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const user = request.authenticatedUser;

  if (!user) {
    throw new AppError(401, "Authentication required.", {
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const permissions = request.authenticatedMembership
    ? getPermissionsForRole(request.authenticatedMembership.role)
    : [];

  ok(response, {
    user,
    membership: request.authenticatedMembership,
    permissions,
  });
}

//************************************************************** */

export async function updateProfileHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId =
    request.authenticatedUser?.id;

  if (!userId) {
    throw new AppError(
      401,
      "Authentication required.",
      {
        code: "AUTHENTICATION_REQUIRED",
      },
    );
  }

  const input =
    requireValidatedBody<UpdateProfileInput>(
      request,
    );

  const user =
    await updateProfile(
      userId,
      input,
    );

  ok(response, {
    message:
      "Profile updated successfully.",
    user,
  });
}

//************************************************************** */

export async function changeEmailHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId =
    request.authenticatedUser?.id;

  const sessionId =
    request.authenticationSessionId;

  if (!userId || !sessionId) {
    throw new AppError(
      401,
      "Authentication required.",
      {
        code: "AUTHENTICATION_REQUIRED",
      },
    );
  }

  const input =
    requireValidatedBody<ChangeEmailInput>(
      request,
    );

  const user =
    await changeEmail(
      userId,
      sessionId,
      input,
      getRequestContext(request),
    );

  ok(response, {
    message:
      "Email changed successfully.",
    user,
  });
}

//************************************************************** */
