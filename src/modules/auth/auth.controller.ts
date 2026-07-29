// HTTP request and response handling

import type { Request, Response } from "express";
import type { RequestContext } from "./auth.types.js";
import type { AuthenticatedRequest } from "./auth.middleware.js";
import { getPermissionsForRole } from "../permissions/permission.utils.js";
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
} from "./auth.service.js";

import type {
  LoginInput,
  LogoutInput,
  RefreshSessionInput,
  RegisterInput,
  SwitchOrganizationInput,
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
  request: Request<Record<string, never>, unknown, RegisterInput>,
  response: Response,
): Promise<void> {
  const result = await registerUser(request.body, getRequestContext(request));

  setAuthenticationCookies(response, result.accessToken, result.refreshToken);

  const permissions = result.membership
    ? getPermissionsForRole(result.membership.role)
    : [];

  response.status(201).json({
    user: result.user,
    membership: result.membership,
    permissions,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}

//************************************************************** */

export async function login(
  request: Request<Record<string, never>, unknown, LoginInput>,
  response: Response,
): Promise<void> {
  const result = await loginUser(request.body, getRequestContext(request));

  setAuthenticationCookies(response, result.accessToken, result.refreshToken);

  const permissions = result.membership
    ? getPermissionsForRole(result.membership.role)
    : [];

  response.status(200).json({
    user: result.user,
    membership: result.membership,
    permissions,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}

//************************************************************** */

export async function refresh(
  request: Request<Record<string, never>, unknown, RefreshSessionInput>,
  response: Response,
): Promise<void> {
  const result = await refreshSession(request.body, getRequestContext(request));

  setAuthenticationCookies(response, result.accessToken, result.refreshToken);

  const permissions = result.membership
    ? getPermissionsForRole(result.membership.role)
    : [];

  response.status(200).json({
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
    response.status(401).json({
      message: "Authentication required.",
    });

    return;
  }

  const input = request.body as SwitchOrganizationInput;

  const result = await switchOrganization(userId, sessionId, input);

  setAccessTokenCookie(response, result.accessToken);

  const permissions = getPermissionsForRole(result.membership.role);

  response.status(200).json({
    data: {
      membership: result.membership,
      permissions,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
    },
  });
}

//************************************************************** */

export async function logout(
  request: Request<Record<string, never>, unknown, LogoutInput>,
  response: Response,
): Promise<void> {
  await logoutUser(request.body);

  clearAuthenticationCookies(response);

  response.status(204).send();
}

//************************************************************** */

export async function logoutAll(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.authenticatedUser?.id;

  if (!userId) {
    response.status(401).json({
      message: "Authentication required.",
    });

    return;
  }

  const revokedSessionCount = await logoutAllUserSessions(userId);

  clearAuthenticationCookies(response);

  response.status(200).json({
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
    response.status(401).json({
      message: "Authentication required.",
    });

    return;
  }

  const permissions = request.authenticatedMembership
    ? getPermissionsForRole(request.authenticatedMembership.role)
    : [];

  response.status(200).json({
    data: {
      user,
      membership: request.authenticatedMembership,
      permissions,
    },
  });
}

//************************************************************** */
