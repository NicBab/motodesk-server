import assert from "node:assert/strict";

import { after, before, describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";

import { prisma } from "../../../src/config/prisma.js";

import { hashPassword } from "../../../src/modules/auth/security/password.service.js";

import { REFRESH_TOKEN_COOKIE_NAME } from "../../../src/modules/auth/auth.constants.js";

//************************************************************** */

const TEST_EMAIL = `concurrent.refresh.${Date.now()}@motodesk.test`;

const TEST_PASSWORD = "MotoDeskConcurrentRefresh123!";

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

  assert.ok(cookiePair);

  const separatorIndex = cookiePair.indexOf("=");

  assert.ok(separatorIndex > 0);

  return cookiePair.slice(separatorIndex + 1);
}

//************************************************************** */

function createRefreshCookie(refreshToken: string): string {
  return `${REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}`;
}

//************************************************************** */

before(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,

      passwordHash,

      firstName: "Concurrent",

      lastName: "Refresh",

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

describe("Concurrent refresh integration", () => {
  it("allows the same refresh token to be consumed at most once", async () => {
    //************************************************************** */
    // Establish one authenticated session.

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: TEST_EMAIL,

      password: TEST_PASSWORD,
    });

    assert.equal(loginResponse.status, 200);

    const originalRefreshToken = getCookieValue(
      loginResponse,
      REFRESH_TOKEN_COOKIE_NAME,
    );

    const originalCookie = createRefreshCookie(originalRefreshToken);

    //************************************************************** */
    // Start two refresh operations with exactly the same credential
    // before either response has been awaited.

    const [firstResponse, secondResponse] = await Promise.all([
      request(app).post("/api/v1/auth/refresh").set("Cookie", originalCookie),

      request(app).post("/api/v1/auth/refresh").set("Cookie", originalCookie),
    ]);

    const responses = [firstResponse, secondResponse];

    //************************************************************** */
    // The original refresh credential is single-use. It must never
    // produce two successful rotations.

    const successfulResponses = responses.filter(
      (response) => response.status === 200,
    );

    const rejectedResponses = responses.filter(
      (response) => response.status === 401,
    );

    assert.equal(
      successfulResponses.length,
      1,
      "The same refresh token must not successfully rotate twice.",
    );

    assert.equal(
      rejectedResponses.length,
      1,
      "One concurrent refresh request must be rejected.",
    );

    const rejectedResponse = rejectedResponses[0];

    assert.ok(rejectedResponse);

    assert.equal(rejectedResponse.body?.success, false);

    assert.equal(rejectedResponse.body?.code, "SESSION_INVALID");

    //************************************************************** */
    // Confirm that only one database session exists. Concurrent
    // refreshes must never fork one login into multiple sessions.

    const sessions = await prisma.session.findMany({
      where: {
        userId: testUserId,
      },
    });

    assert.equal(sessions.length, 1);

    const session = sessions[0];

    assert.ok(session);

    // A successful rotation must have retained the consumed
    // credential hash.

    assert.ok(session.previousTokenHash);

    assert.notEqual(session.tokenHash, session.previousTokenHash);
  });
});

//************************************************************** */
