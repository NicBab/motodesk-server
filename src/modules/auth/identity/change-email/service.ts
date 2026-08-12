import { AppError } from "../../../../platform/errors/app-error.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../audit/audit.constants.js";

import { createAuditLog } from "../../../audit/audit.service.js";

import type { AuthenticatedUser, RequestMetadata } from "../../auth.types.js";

import type { ChangeEmailInput } from "./schema.js";

import { findUserIdByEmail } from "../../shared/repositories/user-auth.repository.js";

import { findUserEmailById, updateUserEmailRecord } from "./repository.js";

import { verifyPassword } from "../../security/password.service.js";

import { toAuthenticatedUser } from "../../shared/mappers/auth.mapper.js";

//************************************************************** */

export async function changeEmail(
  userId: string,
  sessionId: string,
  input: ChangeEmailInput,
  context: RequestMetadata,
): Promise<AuthenticatedUser> {
  const user = await findUserEmailById(userId);

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

  const passwordMatches = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new AppError(401, "Current password is incorrect.", {
      code: "CURRENT_PASSWORD_INCORRECT",
    });
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

  const existingUser = await findUserIdByEmail(input.newEmail);

  if (existingUser) {
    throw new AppError(
      409,
      "An account with this email address already exists.",
      {
        code: "EMAIL_ALREADY_REGISTERED",
      },
    );
  }

  const updatedUser = await updateUserEmailRecord(userId, input.newEmail);

  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_EMAIL_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.USER,
    entityId: userId,
    actor: {
      userId,
      sessionId,
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
      previousEmail: user.email,
      newEmail: updatedUser.email,
    },
  });

  return toAuthenticatedUser(updatedUser);
}
