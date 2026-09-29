import assert from "node:assert/strict";
import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../src/modules/audit/audit.constants.js";

//************************************************************** */

function createUniqueEmail(): string {
  return `change-password-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}@motodesk.local`;
}

//************************************************************** */

function createUniqueSlug(): string {
  return `change-password-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

//************************************************************** */

const CURRENT_PASSWORD = "MotoDeskTest123!";

const NEW_PASSWORD = "MotoDeskChanged456!";

//************************************************************** */

async function createTestAccount() {
  const agent = request.agent(app);

  const email = createUniqueEmail();

  const registerResponse = await agent.post("/api/v1/auth/register").send({
    email,

    password: CURRENT_PASSWORD,

    firstName: "Password",

    lastName: "Security",

    organization: {
      name: "Password Security Test",

      slug: createUniqueSlug(),
    },
  });

  assert.equal(registerResponse.status, 201);

  assert.equal(registerResponse.body?.success, true);

  const userId = registerResponse.body?.data?.user?.id;

  assert.equal(typeof userId, "string");

  return {
    agent,
    email,
    userId: userId as string,
  };
}

//************************************************************** */

describe("Change password security integration", () => {
  it("rejects an incorrect current password", async () => {
    const { agent } = await createTestAccount();

    const response = await agent.post("/api/v1/auth/change-password").send({
      currentPassword: "IncorrectPassword123!",

      newPassword: NEW_PASSWORD,

      confirmNewPassword: NEW_PASSWORD,
    });

    assert.equal(response.status, 401);

    assert.equal(response.body?.success, false);

    assert.equal(response.body?.code, "CURRENT_PASSWORD_INCORRECT");
  });

  //************************************************************** */

  it("changes the password and prevents the old password from authenticating", async () => {
    const { agent, email } = await createTestAccount();

    const changeResponse = await agent
      .post("/api/v1/auth/change-password")
      .send({
        currentPassword: CURRENT_PASSWORD,

        newPassword: NEW_PASSWORD,

        confirmNewPassword: NEW_PASSWORD,
      });

    assert.equal(changeResponse.status, 200);

    assert.equal(changeResponse.body?.success, true);

    //************************************************************** */
    // The old password must stop working immediately.

    const oldPasswordResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email,

        password: CURRENT_PASSWORD,
      });

    assert.equal(oldPasswordResponse.status, 401);

    assert.equal(oldPasswordResponse.body?.success, false);

    assert.equal(oldPasswordResponse.body?.code, "INVALID_CREDENTIALS");

    //************************************************************** */
    // The replacement password must authenticate successfully.

    const newPasswordResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email,

        password: NEW_PASSWORD,
      });

    assert.equal(newPasswordResponse.status, 200);

    assert.equal(newPasswordResponse.body?.success, true);
  });

  //************************************************************** */

  it("revokes other sessions while preserving the session that changed the password", async () => {
    const { agent, email } = await createTestAccount();

    //************************************************************** */
    // Create a second authenticated session for the same user.

    const secondAgent = request.agent(app);

    const secondLoginResponse = await secondAgent
      .post("/api/v1/auth/login")
      .send({
        email,

        password: CURRENT_PASSWORD,
      });

    assert.equal(secondLoginResponse.status, 200);

    assert.equal(secondLoginResponse.body?.success, true);

    //************************************************************** */
    // Change the password from the original session.

    const changeResponse = await agent
      .post("/api/v1/auth/change-password")
      .send({
        currentPassword: CURRENT_PASSWORD,

        newPassword: NEW_PASSWORD,

        confirmNewPassword: NEW_PASSWORD,
      });

    assert.equal(changeResponse.status, 200);

    assert.equal(changeResponse.body?.success, true);

    assert.equal(
      typeof changeResponse.body?.data?.revokedSessionCount,
      "number",
    );

    assert.ok(changeResponse.body.data.revokedSessionCount >= 1);

    //************************************************************** */
    // The session that performed the password change remains valid.

    const currentSessionResponse = await agent.get("/api/v1/auth/me");

    assert.equal(currentSessionResponse.status, 200);

    assert.equal(currentSessionResponse.body?.success, true);

    //************************************************************** */
    // Every other session must have been revoked.

    const revokedSessionResponse = await secondAgent.get("/api/v1/auth/me");

    assert.equal(revokedSessionResponse.status, 401);

    assert.equal(revokedSessionResponse.body?.success, false);
  });

  //************************************************************** */

  it("creates a password-change audit event", async () => {
    const { agent, userId } = await createTestAccount();

    const changeResponse = await agent
      .post("/api/v1/auth/change-password")
      .send({
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmNewPassword: NEW_PASSWORD,
      });

    assert.equal(changeResponse.status, 200);

    assert.equal(changeResponse.body?.success, true);

    //************************************************************** */
    // Password changes are security-significant and must leave an
    // attributable audit record.

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        actorUserId: userId,
        action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditLog);

    assert.equal(auditLog.actorUserId, userId);

    assert.equal(auditLog.action, AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED);

    assert.equal(auditLog.resourceType, AUDIT_ENTITY_TYPES.USER);

    assert.equal(auditLog.resourceId, userId);
  });
});

//************************************************************** */
