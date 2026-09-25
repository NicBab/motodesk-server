import assert from "node:assert/strict";

import { after, before, describe, it } from "node:test";

import request from "supertest";

import { SessionRevocationReason } from "../../../src/generated/prisma/client.js";

import { app } from "../../../src/app.js";

import { prisma } from "../../../src/config/prisma.js";

import { hashPassword } from "../../../src/modules/auth/security/password.service.js";

import { REFRESH_TOKEN_COOKIE_NAME } from "../../../src/modules/auth/auth.constants.js";

//************************************************************** */

const TEST_EMAIL = `refresh.token.reuse.${Date.now()}@motodesk.test`;

const TEST_PASSWORD = "MotoDeskRefreshReuse123!";

let testUserId = "";

//************************************************************** */

function getCookieValue(
  response: request.Response,
  cookieName: string,
): string {
  const setCookieHeader = response.headers["set-cookie"];

  assert.ok(
    Array.isArray(setCookieHeader),
    `Expected response to contain Set-Cookie headers for ${cookieName}.`,
  );

  const cookie = setCookieHeader.find((value) =>
    value.startsWith(`${cookieName}=`),
  );

  assert.ok(cookie, `Expected response to set ${cookieName}.`);

  const cookiePair = cookie.split(";")[0];

  assert.ok(cookiePair, `Expected ${cookieName} cookie to contain a value.`);

  const separatorIndex = cookiePair.indexOf("=");

  assert.ok(separatorIndex > 0, `Expected ${cookieName} cookie to be valid.`);

  return cookiePair.slice(separatorIndex + 1);
}

//************************************************************** */

function createCookieHeader(cookieName: string, cookieValue: string): string {
  return `${cookieName}=${cookieValue}`;
}

//************************************************************** */

before(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,

      passwordHash,

      firstName: "Refresh",

      lastName: "Reuse",

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

describe("Refresh-token reuse integration", () => {
  it("revokes the session when a rotated refresh token is replayed", async () => {
    //************************************************************** */
    // Login and retain refresh token A independently of a
    // Supertest agent's cookie jar.

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: TEST_EMAIL,

      password: TEST_PASSWORD,
    });

    assert.equal(loginResponse.status, 200);

    assert.equal(loginResponse.body?.success, true);

    const refreshTokenA = getCookieValue(
      loginResponse,
      REFRESH_TOKEN_COOKIE_NAME,
    );

    //************************************************************** */
    // Locate the session created by login.

    const sessionsAfterLogin = await prisma.session.findMany({
      where: {
        userId: testUserId,

        revokedAt: null,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.equal(sessionsAfterLogin.length, 1);

    const session = sessionsAfterLogin[0];

    assert.ok(session);

    assert.equal(session.previousTokenHash, null);

    //************************************************************** */
    // Refresh with token A. This must rotate the session to token B
    // while retaining A's hash as previousTokenHash.

    const firstRefreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set(
        "Cookie",
        createCookieHeader(REFRESH_TOKEN_COOKIE_NAME, refreshTokenA),
      );

    assert.equal(firstRefreshResponse.status, 200);

    assert.equal(firstRefreshResponse.body?.success, true);

    const refreshTokenB = getCookieValue(
      firstRefreshResponse,
      REFRESH_TOKEN_COOKIE_NAME,
    );

    assert.notEqual(refreshTokenB, refreshTokenA);

    const rotatedSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: session.id,
      },
    });

    assert.equal(typeof rotatedSession.previousTokenHash, "string");

    assert.ok(rotatedSession.previousTokenHash);

    assert.equal(rotatedSession.revokedAt, null);

    assert.equal(rotatedSession.revokedReason, null);

    //************************************************************** */
    // Replay token A.
    //
    // A is no longer the current refresh token. Because its hash is
    // the immediately previous token hash, this must be classified
    // as confirmed token reuse and revoke the entire session.

    const replayResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set(
        "Cookie",
        createCookieHeader(REFRESH_TOKEN_COOKIE_NAME, refreshTokenA),
      );

    assert.equal(replayResponse.status, 401);

    assert.equal(replayResponse.body?.success, false);

    assert.equal(replayResponse.body?.code, "SESSION_INVALID");

    //************************************************************** */
    // The session must now be revoked specifically because of
    // refresh-token reuse.

    const revokedSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: session.id,
      },
    });

    assert.ok(revokedSession.revokedAt);

    assert.equal(
      revokedSession.revokedReason,
      SessionRevocationReason.TOKEN_REUSE,
    );

    //************************************************************** */
    // Token B was legitimate before the replay, but once reuse is
    // detected the entire session is compromised. B must therefore
    // also be rejected.

    const rotatedTokenResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set(
        "Cookie",
        createCookieHeader(REFRESH_TOKEN_COOKIE_NAME, refreshTokenB),
      );

    assert.equal(rotatedTokenResponse.status, 401);

    assert.equal(rotatedTokenResponse.body?.success, false);

    assert.equal(rotatedTokenResponse.body?.code, "SESSION_INVALID");
  });
});

//************************************************************** */
