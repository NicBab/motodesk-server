import { env } from "../../../../config/env.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../audit/audit.constants.js";

import { createAuditLog } from "../../../audit/audit.service.js";

import type { RequestContext } from "../../auth.types.js";

import type { RequestPasswordResetInput } from "./schema.js";

import { findUserForLogin } from "../../shared/repositories/user-auth.repository.js";

import { createPasswordResetAuthToken } from "../../tokens/one-time-token.service.js";

//************************************************************** */

export interface RequestPasswordResetResult {
  message: string;
  resetToken?: string;
  expiresAt?: Date;
}

//************************************************************** */

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
  context: RequestContext,
): Promise<RequestPasswordResetResult> {
  const user = await findUserForLogin(input.email);

  const genericMessage =
    "If an account exists for this email address, password reset instructions have been sent.";

  if (!user || !user.isActive) {
    return {
      message: genericMessage,
    };
  }

  const resetToken = await createPasswordResetAuthToken(user.id);

  await createAuditLog({
    action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED,
    entityType: AUDIT_ENTITY_TYPES.USER,
    entityId: user.id,
    actor: {
      userId: user.id,
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
  });

  return {
    message: genericMessage,

    ...(env.NODE_ENV === "development"
      ? {
          resetToken: resetToken.token,
          expiresAt: resetToken.expiresAt,
        }
      : {}),
  };
}
