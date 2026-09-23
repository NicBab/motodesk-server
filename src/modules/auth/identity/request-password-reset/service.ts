import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../audit/audit.constants.js";

import {
  createAuditLog,
} from "../../../audit/audit.service.js";

import type {
  RequestMetadata,
} from "../../auth.types.js";

import type {
  RequestPasswordResetInput,
} from "./schema.js";

import {
  findUserForLogin,
} from "../../shared/repositories/user-auth.repository.js";

import {
  createPasswordResetAuthToken,
} from "../../tokens/one-time-token.service.js";

import {
  sendPasswordResetEmail,
} from "../../../../platform/email/auth-email.service.js";

//************************************************************** */

export interface RequestPasswordResetResult {
  message: string;
}

//************************************************************** */

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
  context: RequestMetadata,
): Promise<RequestPasswordResetResult> {
  const genericMessage =
    "If an account exists for this email address, password reset instructions have been sent.";

  const user =
    await findUserForLogin(
      input.email,
    );

  //************************************************************** */
  // Always return the same response for unknown or inactive
  // accounts so this endpoint cannot be used for account discovery.

  if (
    !user ||
    !user.isActive
  ) {
    return {
      message:
        genericMessage,
    };
  }

  //************************************************************** */
  // OAuth-only users do not have a MotoDesk password to reset.
  //
  // Return the same generic response so callers cannot determine
  // which authentication methods are configured for an account.

  if (
    user.passwordHash === null
  ) {
    return {
      message:
        genericMessage,
    };
  }

  //************************************************************** */
  // Persist the one-time reset token before contacting the external
  // email provider. AuthToken stores only the token hash.

  const resetToken =
    await createPasswordResetAuthToken(
      user.id,
    );

  //************************************************************** */
  // Preserve the existing security audit trail.

  await createAuditLog({
    action:
      AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED,

    entityType:
      AUDIT_ENTITY_TYPES.USER,

    entityId:
      user.id,

    actor: {
      userId:
        user.id,
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

  //************************************************************** */
  // Deliver the plaintext token only through the transactional
  // email channel as part of the password-reset URL.

  await sendPasswordResetEmail({
    email:
      user.email,

    firstName:
      user.firstName,

    resetToken:
      resetToken.token,
  });

  //************************************************************** */
  // Never expose password-reset credentials through the HTTP API.

  return {
    message:
      genericMessage,
  };
}

//************************************************************** */