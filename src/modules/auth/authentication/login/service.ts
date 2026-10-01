import { logger } from "../../../../config/logger.js";

import { AppError } from "../../../../platform/errors/app-error.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../audit/audit.constants.js";

import { createAuditLog } from "../../../audit/audit.service.js";

import { findUserForLogin } from "../../shared/repositories/user-auth.repository.js";

import { verifyPassword } from "../../security/password.service.js";

import { createAuthenticationResult } from "../../shared/authentication-result.builder.js";

import type { LoginInput } from "./schema.js";

import type {
  AuthenticationResult,
  RequestMetadata,
} from "../../auth.types.js";

//************************************************************** */

function buildAuditContext(context: RequestMetadata) {
  return {
    ...(context.ipAddress !== null
      ? {
          ipAddress: context.ipAddress,
        }
      : {}),

    ...(context.userAgent !== null
      ? {
          userAgent: context.userAgent,
        }
      : {}),
  };
}

//************************************************************** */

export async function loginUser(
  input: LoginInput,
  context: RequestMetadata,
): Promise<AuthenticationResult> {
  const user = await findUserForLogin(input.email);

  if (!user) {
    logger.warn("Authentication failed", {
      reason: "USER_NOT_FOUND",

      ipAddress: context.ipAddress,

      userAgent: context.userAgent,
    });

    //************************************************************** */
    // Do not create a tenant-scoped persisted audit record for an
    // unknown email address. There is no verified user or organization
    // to attribute the event to, and persisting attempted identifiers
    // here would unnecessarily retain attacker-controlled login data.

    throw new AppError(401, "Invalid email address or password.", {
      code: "INVALID_CREDENTIALS",
    });
  }

  const membership = user.memberships[0] ?? null;

  const organizationId = membership?.organizationId;

  //************************************************************** */

  if (!user.isActive) {
    logger.warn("Authentication failed", {
      reason: "ACCOUNT_INACTIVE",

      userId: user.id,

      ipAddress: context.ipAddress,

      userAgent: context.userAgent,
    });

    await createAuditLog({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,

      entityType: AUDIT_ENTITY_TYPES.USER,

      entityId: user.id,

      actor: {
        userId: user.id,

        ...(organizationId !== undefined
          ? {
              organizationId,
            }
          : {}),
      },

      context: buildAuditContext(context),

      metadata: {
        reason: "ACCOUNT_INACTIVE",
      },
    });

    throw new AppError(403, "This account is currently inactive.", {
      code: "ACCOUNT_INACTIVE",
    });
  }

  //************************************************************** */
  // OAuth-only accounts do not have a local password.
  //
  // Keep the response identical to an incorrect password so the
  // endpoint does not disclose which authentication methods are
  // configured for an account.

  if (!user.passwordHash) {
    logger.warn("Authentication failed", {
      reason: "LOCAL_PASSWORD_UNAVAILABLE",

      userId: user.id,

      ipAddress: context.ipAddress,

      userAgent: context.userAgent,
    });

    await createAuditLog({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,

      entityType: AUDIT_ENTITY_TYPES.USER,

      entityId: user.id,

      actor: {
        userId: user.id,

        ...(organizationId !== undefined
          ? {
              organizationId,
            }
          : {}),
      },

      context: buildAuditContext(context),

      metadata: {
        reason: "LOCAL_PASSWORD_UNAVAILABLE",
      },
    });

    throw new AppError(401, "Invalid email address or password.", {
      code: "INVALID_CREDENTIALS",
    });
  }

  //************************************************************** */

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    logger.warn("Authentication failed", {
      reason: "INVALID_PASSWORD",

      userId: user.id,

      ipAddress: context.ipAddress,

      userAgent: context.userAgent,
    });

    await createAuditLog({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,

      entityType: AUDIT_ENTITY_TYPES.USER,

      entityId: user.id,

      actor: {
        userId: user.id,

        ...(organizationId !== undefined
          ? {
              organizationId,
            }
          : {}),
      },

      context: buildAuditContext(context),

      metadata: {
        reason: "INVALID_PASSWORD",
      },
    });

    throw new AppError(401, "Invalid email address or password.", {
      code: "INVALID_CREDENTIALS",
    });
  }

  //************************************************************** */
  // Create the authenticated session first. A successful-login audit
  // event should represent authentication that actually completed.

  const result = await createAuthenticationResult(user, membership, context);

  //************************************************************** */

  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED,

    entityType: AUDIT_ENTITY_TYPES.USER,

    entityId: user.id,

    actor: {
      userId: user.id,

      ...(organizationId !== undefined
        ? {
            organizationId,
          }
        : {}),
    },

    context: buildAuditContext(context),

    metadata: {
      membershipId: result.membership?.id ?? null,

      sessionEstablished: true,
    },
  });

  return result;
}

//************************************************************** */
