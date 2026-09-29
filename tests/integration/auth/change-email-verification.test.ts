import assert from "node:assert/strict";

import { after, before, describe, it } from "node:test";

import request from "supertest";

import { AuthTokenType } from "../../../src/generated/prisma/client.js";

import { app } from "../../../src/app.js";

import { prisma } from "../../../src/config/prisma.js";

import { hashPassword } from "../../../src/modules/auth/security/password.service.js";

//************************************************************** */

const ORIGINAL_EMAIL = `change-email-original-${Date.now()}@motodesk.test`;

const NEW_EMAIL = `change-email-new-${Date.now()}@motodesk.test`;

const PASSWORD = "MotoDeskChangeEmail123!";

let testUserId = "";

//************************************************************** */

before(async () => {
  const passwordHash = await hashPassword(PASSWORD);

  const user = await prisma.user.create({
    data: {
      email: ORIGINAL_EMAIL,

      passwordHash,

      firstName: "Change",

      lastName: "Email",

      isActive: true,

      emailVerifiedAt: new Date(),
    },

    select: {
      id: true,
    },
  });

  testUserId = user.id;
});

//************************************************************** */

after(async () => {
  if (!testUserId) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      userId: testUserId,
    },
  });

  await prisma.authToken.deleteMany({
    where: {
      userId: testUserId,
    },
  });

  await prisma.auditLog.deleteMany({
    where: {
      actorUserId: testUserId,
    },
  });

  await prisma.user.delete({
    where: {
      id: testUserId,
    },
  });
});

//************************************************************** */

describe("Change email verification integration", () => {
  it("marks a replacement email unverified and creates a new verification credential", async () => {
    const agent = request.agent(app);

    //************************************************************** */
    // Authenticate using the original verified email.

    const loginResponse = await agent.post("/api/v1/auth/login").send({
      email: ORIGINAL_EMAIL,

      password: PASSWORD,
    });

    assert.equal(loginResponse.status, 200);

    assert.equal(loginResponse.body?.success, true);

    //************************************************************** */
    // Change the primary email using password re-authentication.

    const changeResponse = await agent.post("/api/v1/auth/change-email").send({
      newEmail: NEW_EMAIL,

      currentPassword: PASSWORD,
    });

    assert.equal(changeResponse.status, 200);

    assert.equal(changeResponse.body?.success, true);

    assert.equal(changeResponse.body?.data?.user?.email, NEW_EMAIL);

    assert.equal(changeResponse.body?.data?.user?.emailVerifiedAt, null);

    //************************************************************** */
    // Verification state must have been cleared in persistence.
    //
    // Verification belongs to the address itself. Verification of
    // ORIGINAL_EMAIL must not transfer to NEW_EMAIL.

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: {
        id: testUserId,
      },

      select: {
        email: true,

        emailVerifiedAt: true,
      },
    });

    assert.equal(updatedUser.email, NEW_EMAIL);

    assert.equal(updatedUser.emailVerifiedAt, null);

    //************************************************************** */
    // A fresh email-verification credential must exist for the new
    // address. The database intentionally contains only its hash.

    const verificationTokens = await prisma.authToken.findMany({
      where: {
        userId: testUserId,

        type: AuthTokenType.EMAIL_VERIFICATION,

        usedAt: null,

        expiresAt: {
          gt: new Date(),
        },
      },
    });

    assert.equal(verificationTokens.length, 1);

    assert.ok(verificationTokens[0]?.tokenHash);

    //************************************************************** */
    // Identity/bootstrap remains available so the client can render
    // the verification flow.

    const meResponse = await agent.get("/api/v1/auth/me");

    assert.equal(meResponse.status, 200);

    assert.equal(meResponse.body?.success, true);

    assert.equal(meResponse.body?.data?.user?.email, NEW_EMAIL);

    assert.equal(meResponse.body?.data?.user?.emailVerifiedAt, null);
  });
});

//************************************************************** */
