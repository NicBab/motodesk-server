import assert from "node:assert/strict";
import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import { assertRecentAuthentication } from "../../../src/modules/auth/sessions/session.service.js";

//************************************************************** */

const PASSWORD = "MotoDeskTest123!";

const STALE_AUTHENTICATION_DATE = new Date("2000-01-01T00:00:00.000Z");

//************************************************************** */

function createUniqueEmail(): string {
  return `recent-auth-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}@motodesk.local`;
}

//************************************************************** */

function createUniqueSlug(): string {
  return `recent-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

//************************************************************** */

async function createTestAccount() {
  const agent = request.agent(app);

  const registerResponse = await agent.post("/api/v1/auth/register").send({
    email: createUniqueEmail(),

    password: PASSWORD,

    firstName: "Recent",

    lastName: "Enforcement",

    organization: {
      name: "Recent Authentication Enforcement",

      slug: createUniqueSlug(),
    },
  });

  assert.equal(registerResponse.status, 201);

  assert.equal(registerResponse.body?.success, true);

  const userId = registerResponse.body?.data?.user?.id;

  assert.equal(typeof userId, "string");

  const session = await prisma.session.findFirst({
    where: {
      userId: userId as string,

      revokedAt: null,
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  assert.ok(session);

  return {
    agent,

    sessionId: session.id,
  };
}

//************************************************************** */

describe("Recent authentication enforcement integration", () => {
  it("accepts a newly authenticated session", async () => {
    const { sessionId } = await createTestAccount();

    await assert.doesNotReject(assertRecentAuthentication(sessionId));
  });

  //************************************************************** */

  it("rejects a session whose credential authentication is stale", async () => {
    const { sessionId } = await createTestAccount();

    await prisma.session.update({
      where: {
        id: sessionId,
      },

      data: {
        lastAuthenticatedAt: STALE_AUTHENTICATION_DATE,
      },
    });

    await assert.rejects(
      assertRecentAuthentication(sessionId),
      (error: unknown) => {
        if (typeof error !== "object" || error === null) {
          return false;
        }

        const candidate = error as {
          statusCode?: unknown;
          code?: unknown;
        };

        return (
          candidate.statusCode === 403 &&
          candidate.code === "RECENT_AUTHENTICATION_REQUIRED"
        );
      },
    );
  });

  //************************************************************** */

  it("allows a stale session after successful reauthentication", async () => {
    const { agent, sessionId } = await createTestAccount();

    await prisma.session.update({
      where: {
        id: sessionId,
      },

      data: {
        lastAuthenticatedAt: STALE_AUTHENTICATION_DATE,
      },
    });

    await assert.rejects(assertRecentAuthentication(sessionId));

    const reauthenticateResponse = await agent
      .post("/api/v1/auth/reauthenticate")
      .send({
        currentPassword: PASSWORD,
      });

    assert.equal(reauthenticateResponse.status, 200);

    assert.equal(reauthenticateResponse.body?.success, true);

    await assert.doesNotReject(assertRecentAuthentication(sessionId));
  });

  //************************************************************** */

  it("does not restore recent authentication when reauthentication fails", async () => {
    const { agent, sessionId } = await createTestAccount();

    await prisma.session.update({
      where: {
        id: sessionId,
      },

      data: {
        lastAuthenticatedAt: STALE_AUTHENTICATION_DATE,
      },
    });

    const reauthenticateResponse = await agent
      .post("/api/v1/auth/reauthenticate")
      .send({
        currentPassword: "IncorrectPassword123!",
      });

    assert.equal(reauthenticateResponse.status, 401);

    assert.equal(
      reauthenticateResponse.body?.code,
      "CURRENT_PASSWORD_INCORRECT",
    );

    await assert.rejects(
      assertRecentAuthentication(sessionId),
      (error: unknown) => {
        if (typeof error !== "object" || error === null) {
          return false;
        }

        const candidate = error as {
          statusCode?: unknown;
          code?: unknown;
        };

        return (
          candidate.statusCode === 403 &&
          candidate.code === "RECENT_AUTHENTICATION_REQUIRED"
        );
      },
    );
  });
});

//************************************************************** */
