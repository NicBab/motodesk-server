import { SessionRevocationReason } from "../../../../generated/prisma/client.js";

import { AppError } from "../../../../platform/errors/app-error.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../audit/audit.constants.js";
import { createAuditLog } from "../../../audit/audit.service.js";

import type {
  ChangePasswordResult,
  RequestMetadata,
} from "../../auth.types.js";

import { findUserPasswordById } from "./repository.js";

import { updateUserPasswordHash } from "../shared/password.repository.js";

import {
  hashPassword,
  verifyPassword,
} from "../../security/password.service.js";

import { revokeUserSessions } from "../../sessions/session.service.js";

import type { ChangePasswordInput } from "./schema.js";

//************************************************************** */

export async function changePassword(
  userId: string,
  currentSessionId: string,
  input: ChangePasswordInput,
  context: RequestMetadata,
): Promise<ChangePasswordResult> {
  const user = await findUserPasswordById(userId);

  if (!user) {
    throw new AppError(404, "User account not found.", {
      code: "USER_NOT_FOUND",
    });
  }

  if (!user.isActive) {
    throw new AppError(403, "This account is currently inactive.", {
      code: "ACCOUNT_INACTIVE",
    });
  }

  const currentPasswordMatches = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!currentPasswordMatches) {
    throw new AppError(401, "Current password is incorrect.", {
      code: "CURRENT_PASSWORD_INCORRECT",
    });
  }

  const newPasswordMatchesCurrent = await verifyPassword(
    input.newPassword,
    user.passwordHash,
  );

  if (newPasswordMatchesCurrent) {
    throw new AppError(
      400,
      "The new password must be different from the current password.",
      {
        code: "NEW_PASSWORD_MUST_BE_DIFFERENT",
      },
    );
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  await updateUserPasswordHash(userId, newPasswordHash);

  const revokedSessions = await revokeUserSessions(
    userId,
    SessionRevocationReason.PASSWORD_CHANGED,
    currentSessionId,
  );

  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.USER,
    entityId: userId,
    actor: {
      userId,
      sessionId: currentSessionId,
    },
    context: {
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
    },
    metadata: {
      revokedSessionCount: revokedSessions.revokedSessionCount,
    },
  });

  return {
    revokedSessionCount: revokedSessions.revokedSessionCount,
  };
}
