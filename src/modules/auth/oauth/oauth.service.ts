import { ExternalAuthProvider } from "../../../generated/prisma/client.js";

import { AppError } from "../../../platform/errors/app-error.js";

import type { AuthenticationResult, RequestMetadata } from "../auth.types.js";

import { createAuthenticationResult } from "../shared/authentication-result.builder.js";

import {
  createExternalUser,
  findExternalAuthAccount,
  findExternalAuthAccountForUser,
  findUserForExternalAuthentication,
  linkExternalAuthAccount,
  updateExternalAuthAccountEmail,
} from "./oauth.repository.js";

//************************************************************** */

export interface VerifiedExternalIdentity {
  provider: ExternalAuthProvider;

  providerAccountId: string;

  email: string;

  emailVerified: boolean;

  firstName: string;

  lastName: string;
}

//************************************************************** */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

//************************************************************** */

function normalizeName(value: string): string {
  return value.trim();
}

//************************************************************** */

export async function authenticateExternalIdentity(
  identity: VerifiedExternalIdentity,
  context: RequestMetadata,
): Promise<AuthenticationResult> {
  const email = normalizeEmail(identity.email);

  const firstName = normalizeName(identity.firstName);

  const lastName = normalizeName(identity.lastName);

  //************************************************************** */
  // Provider authentication is only trusted when the provider
  // has verified ownership of the returned email address.

  if (!identity.emailVerified) {
    throw new AppError(
      401,
      "The external authentication provider did not verify this email address.",
      {
        code: "EXTERNAL_EMAIL_NOT_VERIFIED",
      },
    );
  }

  if (email.length === 0) {
    throw new AppError(
      401,
      "The external authentication provider did not return an email address.",
      {
        code: "EXTERNAL_EMAIL_REQUIRED",
      },
    );
  }

  if (identity.providerAccountId.trim().length === 0) {
    throw new AppError(
      401,
      "The external authentication provider returned an invalid account identifier.",
      {
        code: "EXTERNAL_ACCOUNT_ID_REQUIRED",
      },
    );
  }

  //************************************************************** */
  // CASE 1
  //
  // This exact external provider identity has already been linked.
  // The provider account ID is the authoritative lookup here.

  const existingExternalAccount = await findExternalAuthAccount(
    identity.provider,
    identity.providerAccountId,
  );

  if (existingExternalAccount) {
    const user = existingExternalAccount.user;

    if (!user.isActive) {
      throw new AppError(403, "This account is currently inactive.", {
        code: "ACCOUNT_INACTIVE",
      });
    }

    // Keep the provider email snapshot current without changing
    // the MotoDesk account's primary email address.

    if (existingExternalAccount.providerEmail !== email) {
      await updateExternalAuthAccountEmail(existingExternalAccount.id, email);
    }

    const membership = user.memberships[0] ?? null;

    return createAuthenticationResult(user, membership, context);
  }

  //************************************************************** */
  // CASE 2
  //
  // No provider link exists yet, but MotoDesk already has a user
  // with the same provider-verified email address.
  //
  // Link the provider to that existing user rather than creating
  // a duplicate MotoDesk account.

  const existingUser = await findUserForExternalAuthentication(email);

  if (existingUser) {
    if (!existingUser.isActive) {
      throw new AppError(403, "This account is currently inactive.", {
        code: "ACCOUNT_INACTIVE",
      });
    }

    const existingProviderLink = await findExternalAuthAccountForUser(
      existingUser.id,
      identity.provider,
    );

    if (existingProviderLink) {
      throw new AppError(
        409,
        "This MotoDesk account is already linked to a different account from this authentication provider.",
        {
          code: "EXTERNAL_PROVIDER_ALREADY_LINKED",
        },
      );
    }

    await linkExternalAuthAccount({
      userId: existingUser.id,

      provider: identity.provider,

      providerAccountId: identity.providerAccountId,

      providerEmail: email,
    });

    const membership = existingUser.memberships[0] ?? null;

    return createAuthenticationResult(existingUser, membership, context);
  }

  //************************************************************** */
  // CASE 3
  //
  // This is a completely new MotoDesk identity.
  //
  // Create a passwordless user and provider link atomically.

  const created = await createExternalUser({
    email,

    firstName: firstName || "MotoDesk",

    lastName: lastName || "User",

    provider: identity.provider,

    providerAccountId: identity.providerAccountId,

    providerEmail: email,
  });

  const membership = created.user.memberships[0] ?? null;

  return createAuthenticationResult(created.user, membership, context);
}

//************************************************************** */
