import assert from "node:assert/strict";
import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

//************************************************************** */

const PASSWORD = "MotoDeskTest123!";

const STALE_AUTHENTICATION_DATE = new Date("2000-01-01T00:00:00.000Z");

//************************************************************** */

function createUniqueEmail(): string {
  return `reauthentication-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}@motodesk.local`;
}

//************************************************************** */

function createUniqueSlug(): string {
  return `reauthentication-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

//************************************************************** */

async function createTestAccount() {
  const agent = request.agent(app);

  const registerResponse = await agent.post("/api/v1/auth/register").send({
    email: createUniqueEmail(),

    password: PASSWORD,

    firstName: "Recent",

    lastName: "Authentication",

    organization: {
      name: "Recent Authentication Test",

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
    userId: userId as string,
    sessionId: session.id,
  };
}

//************************************************************** */

describe("Reauthentication integration", () => {
  it("does not advance lastAuthenticatedAt when the password is incorrect", async () => {
    const { agent, sessionId } = await createTestAccount();

    await prisma.session.update({
      where: {
        id: sessionId,
      },

      data: {
        lastAuthenticatedAt: STALE_AUTHENTICATION_DATE,
      },
    });

    const response = await agent.post("/api/v1/auth/reauthenticate").send({
      currentPassword: "IncorrectPassword123!",
    });

    assert.equal(response.status, 401);

    assert.equal(response.body?.success, false);

    assert.equal(response.body?.code, "CURRENT_PASSWORD_INCORRECT");

    const session = await prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    assert.ok(session);

    assert.equal(
      session.lastAuthenticatedAt.getTime(),
      STALE_AUTHENTICATION_DATE.getTime(),
    );
  });

  //************************************************************** */

  it("advances lastAuthenticatedAt after a successful credential challenge", async () => {
    const { agent, sessionId } = await createTestAccount();

    await prisma.session.update({
      where: {
        id: sessionId,
      },

      data: {
        lastAuthenticatedAt: STALE_AUTHENTICATION_DATE,
      },
    });

    const beforeReauthentication = Date.now();

    const response = await agent.post("/api/v1/auth/reauthenticate").send({
      currentPassword: PASSWORD,
    });

    assert.equal(response.status, 200);

    assert.equal(response.body?.success, true);

    const session = await prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    assert.ok(session);

    assert.ok(session.lastAuthenticatedAt.getTime() >= beforeReauthentication);

    assert.ok(session.lastAuthenticatedAt.getTime() <= Date.now());
  });

  //************************************************************** */

  it("does not allow an unauthenticated request to reauthenticate", async () => {
    const response = await request(app)
      .post("/api/v1/auth/reauthenticate")
      .send({
        currentPassword: PASSWORD,
      });

    assert.equal(response.status, 401);

    assert.equal(response.body?.success, false);

    assert.equal(response.body?.code, "AUTHENTICATION_REQUIRED");
  });
});

//************************************************************** */
