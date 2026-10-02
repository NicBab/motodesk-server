import { AppError } from "../../../../platform/errors/app-error.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../audit/audit.constants.js";

import {
  createAuditLog,
} from "../../../audit/audit.service.js";

import {
  consumeEmailVerificationAuthToken,
  validateEmailVerificationAuthToken,
} from "../../tokens/one-time-token.service.js";

import {
  markUserEmailVerified,
} from "./repository.js";

import type {
  VerifyEmailInput,
} from "./schema.js";

//************************************************************** */

export async function verifyEmail(
  input: VerifyEmailInput,
): Promise<void> {
  const authToken =
    await validateEmailVerificationAuthToken(
      input.token,
    );

  if (
    !authToken
  ) {
    throw new AppError(
      400,
      "Email verification token is invalid or expired.",
      {
        code:
          "EMAIL_VERIFICATION_TOKEN_INVALID",
      },
    );
  }

  //************************************************************** */
  // Complete the identity operation before recording successful
  // verification evidence.

  await markUserEmailVerified(
    authToken.userId,
  );

  await consumeEmailVerificationAuthToken(
    authToken.id,
  );

  //************************************************************** */
  // The verification token itself must never enter audit metadata.
  //
  // Email verification can occur independently of organization
  // membership, so this is intentionally a user-scoped event.

  await createAuditLog({
    action:
      AUDIT_ACTIONS.AUTH_EMAIL_VERIFIED,

    entityType:
      AUDIT_ENTITY_TYPES.USER,

    entityId:
      authToken.userId,

    actor: {
      userId:
        authToken.userId,
    },

    metadata: {
      verificationCompleted:
        true,
    },
  });
}

//************************************************************** */