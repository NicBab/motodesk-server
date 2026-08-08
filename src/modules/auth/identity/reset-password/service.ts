import {
  SessionRevocationReason,
} from "../../../../generated/prisma/client.js";

import { AppError } from "../../../../platform/errors/app-error.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../audit/audit.constants.js";
import {
  createAuditLog,
} from "../../../audit/audit.service.js";

import type {
  RequestContext,
} from "../../auth.types.js";

import type {
  ResetPasswordInput,
} from "./schema.js";

import {
  updateUserPasswordHash,
} from "../shared/password.repository.js";

import {
  hashPassword,
} from "../../password.service.js";

import {
  consumePasswordResetAuthToken,
  validatePasswordResetAuthToken,
} from "../../auth-token.service.js";

import {
  revokeAllUserSessions,
} from "../../session.service.js";

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