import { randomUUID } from "node:crypto";

import { env } from "../../../../config/env.js";

import { AppError } from "../../../../platform/errors/app-error.js";

import { hashPassword } from "../../security/password.service.js";

import { generateRefreshToken } from "../../tokens/refresh-token.service.js";

import { generateEmailVerificationToken } from "../../tokens/one-time-token.factory.js";

import { buildAuthenticationResult } from "../../shared/authentication-result.builder.js";

import type { RegisterInput } from "./schema.js";

import type {
  AuthenticationResult,
  RequestMetadata,
} from "../../auth.types.js";

import { findUserIdByEmail } from "../../shared/repositories/user-auth.repository.js";

import { createRegistrationRecords } from "./repository.js";

//************************************************************** */

export async function registerUser(
  input: RegisterInput,
  context: RequestMetadata,
): Promise<AuthenticationResult> {
  const existingUser = await findUserIdByEmail(input.email);

  if (existingUser) {
    throw new AppError(
      409,
      "An account with this email address already exists.",
      {
        code: "EMAIL_ALREADY_REGISTERED",
      },
    );
  }

  const passwordHash = await hashPassword(input.password);

  const sessionId = randomUUID();

  const refreshToken = generateRefreshToken(sessionId);

  const emailVerificationToken = generateEmailVerificationToken();

  const records = await createRegistrationRecords({
    user: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
    },

    session: {
      id: sessionId,
      tokenHash: refreshToken.tokenHash,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      expiresAt: refreshToken.expiresAt,
    },

    emailVerificationToken: {
      tokenHash: emailVerificationToken.tokenHash,
      expiresAt: emailVerificationToken.expiresAt,
    },

    ...(input.organization !== undefined
      ? {
          organization: {
            name: input.organization.name,
            slug: input.organization.slug,

            ...(input.organization.email !== undefined
              ? {
                  email: input.organization.email,
                }
              : {}),

            ...(input.organization.phone !== undefined
              ? {
                  phone: input.organization.phone,
                }
              : {}),
          },
        }
      : {}),
  });

  const authenticationResult = buildAuthenticationResult(
    records.user,
    records.membership,
    records.session.id,
    refreshToken,
  );

  return {
    ...authenticationResult,

    ...(env.NODE_ENV === "development"
      ? {
          emailVerificationToken: emailVerificationToken.token,
          emailVerificationExpiresAt: emailVerificationToken.expiresAt,
        }
      : {}),
  };
}
//************************************************************** */
