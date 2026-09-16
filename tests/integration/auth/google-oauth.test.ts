import assert from "node:assert/strict";

import { after, describe, it } from "node:test";

import { ExternalAuthProvider } from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import { authenticateExternalIdentity } from "../../../src/modules/auth/oauth/oauth.service.js";

//************************************************************** */

const TEST_EMAIL = `google.oauth.${Date.now()}@motodesk.test`;

const TEST_PROVIDER_ACCOUNT_ID = `google-oauth-${Date.now()}`;

//************************************************************** */

const requestMetadata = {
  ipAddress: "127.0.0.1",
  userAgent: "MotoDesk Google OAuth integration test",
};

//************************************************************** */

after(async () => {
  const user = await prisma.user.findUnique({
    where: {
      email: TEST_EMAIL,
    },

    select: {
      id: true,
    },
  });

  if (user) {
    await prisma.session.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await prisma.externalAuthAccount.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await prisma.user.delete({
      where: {
        id: user.id,
      },
    });
  }
});

//************************************************************** */

describe("Google OAuth integration", () => {
  it("creates a new passwordless MotoDesk user and Google account link", async () => {
    const result = await authenticateExternalIdentity(
      {
        provider: ExternalAuthProvider.GOOGLE,

        providerAccountId: TEST_PROVIDER_ACCOUNT_ID,

        email: TEST_EMAIL,

        emailVerified: true,

        firstName: "Google",

        lastName: "User",
      },
      requestMetadata,
    );

    //************************************************************** */
    // A completely new Google identity should authenticate but
    // should not automatically belong to an organization.

    assert.equal(result.user.email, TEST_EMAIL);

    assert.equal(result.membership, null);

    assert.equal(typeof result.accessToken, "string");

    assert.equal(typeof result.refreshToken, "string");

    //************************************************************** */
    // Verify the MotoDesk user was persisted as passwordless.

    const user = await prisma.user.findUnique({
      where: {
        email: TEST_EMAIL,
      },

      include: {
        externalAuthAccounts: true,

        memberships: true,
      },
    });

    assert.ok(user);

    assert.equal(user.passwordHash, null);

    assert.ok(user.emailVerifiedAt instanceof Date);

    assert.equal(user.memberships.length, 0);

    //************************************************************** */
    // Verify the Google identity is linked to the new MotoDesk user.

    assert.equal(user.externalAuthAccounts.length, 1);

    const externalAccount = user.externalAuthAccounts[0];

    assert.equal(externalAccount.provider, ExternalAuthProvider.GOOGLE);

    assert.equal(externalAccount.providerAccountId, TEST_PROVIDER_ACCOUNT_ID);

    assert.equal(externalAccount.providerEmail, TEST_EMAIL);
  });

  //************************************************************** */

  it("reuses the same MotoDesk user on subsequent Google authentication", async () => {
    const existingUser = await prisma.user.findUnique({
      where: {
        email: TEST_EMAIL,
      },

      select: {
        id: true,
      },
    });

    assert.ok(existingUser);

    const result = await authenticateExternalIdentity(
      {
        provider: ExternalAuthProvider.GOOGLE,

        providerAccountId: TEST_PROVIDER_ACCOUNT_ID,

        email: TEST_EMAIL,

        emailVerified: true,

        firstName: "Google",

        lastName: "User",
      },
      requestMetadata,
    );

    assert.equal(result.user.id, existingUser.id);

    assert.equal(result.membership, null);

    //************************************************************** */
    // Reauthentication must not create duplicate users or links.

    const userCount = await prisma.user.count({
      where: {
        email: TEST_EMAIL,
      },
    });

    const externalAccountCount = await prisma.externalAuthAccount.count({
      where: {
        userId: existingUser.id,

        provider: ExternalAuthProvider.GOOGLE,
      },
    });

    assert.equal(userCount, 1);

    assert.equal(externalAccountCount, 1);
  });
});
