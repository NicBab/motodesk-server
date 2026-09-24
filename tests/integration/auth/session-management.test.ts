import assert from "node:assert/strict";

import { after, before, describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";

import { prisma } from "../../../src/config/prisma.js";

import { hashPassword } from "../../../src/modules/auth/security/password.service.js";

//************************************************************** */

const TEST_EMAIL = `session.management.${Date.now()}@motodesk.test`;

const TEST_PASSWORD = "MotoDeskSessions123!";

let testUserId = "";

//************************************************************** */

before(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,

      passwordHash,

      firstName: "Session",

      lastName: "Management",

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

describe("Session management integration", () => {
  it("lists active sessions and identifies the current session", async () => {
    const firstAgent = request.agent(app);

    const secondAgent = request.agent(app);

    const firstLogin = await firstAgent
      .post("/api/v1/auth/login")
      .set("User-Agent", "MotoDesk Test Browser One")
      .send({
        email: TEST_EMAIL,

        password: TEST_PASSWORD,
      });

    assert.equal(firstLogin.status, 200);

    const secondLogin = await secondAgent
      .post("/api/v1/auth/login")
      .set("User-Agent", "MotoDesk Test Browser Two")
      .send({
        email: TEST_EMAIL,

        password: TEST_PASSWORD,
      });

    assert.equal(secondLogin.status, 200);

    const response = await firstAgent.get("/api/v1/auth/sessions");

    assert.equal(response.status, 200);

    assert.equal(response.body?.success, true);

    const sessions = response.body?.data?.sessions;

    assert.equal(Array.isArray(sessions), true);

    assert.equal(sessions.length, 2);

    const currentSessions = sessions.filter(
      (session: { isCurrent: boolean }) => session.isCurrent,
    );

    assert.equal(currentSessions.length, 1);

    const otherSession = sessions.find(
      (session: { isCurrent: boolean }) => !session.isCurrent,
    );

    assert.ok(otherSession);

    //************************************************************** */
    // Revoke the second device from the first device.

    const revokeResponse = await firstAgent.delete(
      `/api/v1/auth/sessions/${otherSession.id}`,
    );

    assert.equal(revokeResponse.status, 200);

    const revokedSessionResponse = await secondAgent.get("/api/v1/auth/me");

    assert.equal(revokedSessionResponse.status, 401);

    //************************************************************** */
    // The current session must remain authenticated.

    const currentSessionResponse = await firstAgent.get("/api/v1/auth/me");

    assert.equal(currentSessionResponse.status, 200);
  });

  //************************************************************** */

  it("does not allow the current session to revoke itself through the other-device endpoint", async () => {
    const agent = request.agent(app);

    const loginResponse = await agent.post("/api/v1/auth/login").send({
      email: TEST_EMAIL,

      password: TEST_PASSWORD,
    });

    assert.equal(loginResponse.status, 200);

    const sessionsResponse = await agent.get("/api/v1/auth/sessions");

    assert.equal(sessionsResponse.status, 200);

    const currentSession = sessionsResponse.body?.data?.sessions?.find(
      (session: { isCurrent: boolean }) => session.isCurrent,
    );

    assert.ok(currentSession);

    const response = await agent.delete(
      `/api/v1/auth/sessions/${currentSession.id}`,
    );

    assert.equal(response.status, 400);

    //************************************************************** */
    // Failed revocation must not destroy the current session.

    const meResponse = await agent.get("/api/v1/auth/me");

    assert.equal(meResponse.status, 200);
  });

  //************************************************************** */

  it("does not allow a user to revoke another user's session", async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);

    const otherUser = await prisma.user.create({
      data: {
        email: `session.owner.${Date.now()}@motodesk.test`,

        passwordHash,

        firstName: "Other",

        lastName: "User",

        isActive: true,

        emailVerifiedAt: new Date(),
      },

      select: {
        id: true,
      },
    });

    try {
      const primaryAgent = request.agent(app);

      const otherAgent = request.agent(app);

      const primaryLogin = await primaryAgent.post("/api/v1/auth/login").send({
        email: TEST_EMAIL,

        password: TEST_PASSWORD,
      });

      assert.equal(primaryLogin.status, 200);

      const otherUserRecord = await prisma.user.findUniqueOrThrow({
        where: {
          id: otherUser.id,
        },

        select: {
          email: true,
        },
      });

      const otherLogin = await otherAgent.post("/api/v1/auth/login").send({
        email: otherUserRecord.email,

        password: TEST_PASSWORD,
      });

      assert.equal(otherLogin.status, 200);

      const otherSessions = await otherAgent.get("/api/v1/auth/sessions");

      assert.equal(otherSessions.status, 200);

      const otherSessionId = otherSessions.body?.data?.sessions?.[0]?.id;

      assert.equal(typeof otherSessionId, "string");

      const response = await primaryAgent.delete(
        `/api/v1/auth/sessions/${otherSessionId}`,
      );

      assert.equal(response.status, 404);

      //************************************************************** */
      // The other user's session must still be valid.

      const otherMeResponse = await otherAgent.get("/api/v1/auth/me");

      assert.equal(otherMeResponse.status, 200);
    } finally {
      await prisma.session.deleteMany({
        where: {
          userId: otherUser.id,
        },
      });

      await prisma.authToken.deleteMany({
        where: {
          userId: otherUser.id,
        },
      });

      await prisma.auditLog.deleteMany({
        where: {
          actorUserId: otherUser.id,
        },
      });

      await prisma.user.delete({
        where: {
          id: otherUser.id,
        },
      });
    }
  });

  //************************************************************** */

  it("revokes all other sessions while preserving the current session", async () => {
    const currentAgent = request.agent(app);

    const secondAgent = request.agent(app);

    const thirdAgent = request.agent(app);

    for (const agent of [currentAgent, secondAgent, thirdAgent]) {
      const response = await agent.post("/api/v1/auth/login").send({
        email: TEST_EMAIL,

        password: TEST_PASSWORD,
      });

      assert.equal(response.status, 200);
    }

    const revokeResponse = await currentAgent.delete(
      "/api/v1/auth/sessions/others",
    );

    assert.equal(revokeResponse.status, 200);

    assert.equal(
      typeof revokeResponse.body?.data?.revokedSessionCount,
      "number",
    );

    const currentResponse = await currentAgent.get("/api/v1/auth/me");

    assert.equal(currentResponse.status, 200);

    const secondResponse = await secondAgent.get("/api/v1/auth/me");

    assert.equal(secondResponse.status, 401);

    const thirdResponse = await thirdAgent.get("/api/v1/auth/me");

    assert.equal(thirdResponse.status, 401);

    //************************************************************** */
    // Only the current active session should remain visible.

    const sessionsResponse = await currentAgent.get("/api/v1/auth/sessions");

    assert.equal(sessionsResponse.status, 200);

    assert.equal(sessionsResponse.body?.data?.sessions?.length, 1);

    assert.equal(sessionsResponse.body?.data?.sessions?.[0]?.isCurrent, true);
  });
});

//************************************************************** */
