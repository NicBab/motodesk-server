import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

import {
  hashToken,
} from "../../../src/modules/auth/tokens/token.crypto.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

function assertNoSensitiveFields(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }

  const forbidden = new Set([
    "password",
    "passwordHash",
    "tokenHash",
    "accessToken",
    "refreshToken",
    "refreshTokenHash",
    "secret",
  ]);

  for (const [key, nested] of Object.entries(value)) {
    assert.equal(
      forbidden.has(key),
      false,
      `Unexpected sensitive response field: ${key}`,
    );

    assertNoSensitiveFields(nested);
  }
}

function accessCookie(
  response: { headers: Record<string, unknown> },
): string {
  const header = response.headers["set-cookie"];

  const lines = Array.isArray(header)
    ? header.map(String)
    : typeof header === "string"
      ? [header]
      : [];

  const cookie = lines.find((line) =>
    line.startsWith("motodesk_access_token="),
  );

  assert.ok(cookie, "Expected client access cookie.");

  return cookie.split(";")[0]!;
}

//************************************************************** */

describe("Invitation HTTP response redaction", () => {
  const password = "MotoDeskResponseRedaction123!";

  let owner: Awaited<
    ReturnType<typeof createAuthenticatedAgent>
  >;

  let invitedUserId: string;
  let invitedEmail: string;
  let passwordHash: string;

  function endpoint() {
    return `/api/v1/organizations/${owner.organizationId}/membership-invitations`;
  }

  async function createInvitation() {
    const response = await owner.agent
      .post(endpoint())
      .send({
        email: invitedEmail,
        role: "TECHNICIAN",
      });

    assert.equal(
      response.status,
      201,
      JSON.stringify(response.body),
    );

    const stored =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: {
          id: response.body.data.invitation.id,
        },
      });

    return {
      response,
      stored,
      token: String(response.body.data.token),
    };
  }

  beforeEach(async () => {
    invitedUserId = "";

    owner = await createAuthenticatedAgent();

    invitedEmail =
      `invitation-redaction-${randomUUID()}@example.com`;

    passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: invitedEmail,
        passwordHash,
        firstName: "Response",
        lastName: "Redaction",
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });

    invitedUserId = user.id;
  });

  afterEach(async () => {
    if (!invitedUserId) {
      return;
    }

    await prisma.auditLog.deleteMany({
      where: {
        actorUserId: invitedUserId,
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: invitedUserId,
      },
    });
  });

  it("returns the creation token without exposing its hash", async () => {
    const { response, stored, token } =
      await createInvitation();

    assert.equal(typeof response.body.data.token, "string");
    assert.ok(token.length > 0);

    assert.equal(stored.tokenHash, hashToken(token));
    assert.notEqual(stored.tokenHash, token);

    assertNoSensitiveFields(response.body);

    const serialized = JSON.stringify(response.body);

    assert.equal(serialized.includes(stored.tokenHash), false);
    assert.equal(serialized.includes(passwordHash), false);

    assert.equal(
      Object.hasOwn(response.body.data.invitation, "token"),
      false,
    );
  });

  it("omits tokens and hashes from invitation listings", async () => {
    const { stored, token } = await createInvitation();

    const response = await owner.agent.get(
      `${endpoint()}?page=1&pageSize=10`,
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.data.items.length, 1);

    const invitation = response.body.data.items[0];

    assert.equal(invitation.id, stored.id);
    assert.equal(invitation.email, invitedEmail);

    assertNoSensitiveFields(response.body);

    const serialized = JSON.stringify(response.body);

    assert.equal(serialized.includes(stored.tokenHash), false);
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes(passwordHash), false);
    assert.equal(Object.hasOwn(invitation, "token"), false);
  });

  it("omits tokens and hashes from revocation responses", async () => {
    const { stored, token } = await createInvitation();

    const response = await owner.agent.delete(
      `${endpoint()}/${stored.id}`,
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, stored.id);
    assert.ok(response.body.data.revokedAt);

    assertNoSensitiveFields(response.body);

    const serialized = JSON.stringify(response.body);

    assert.equal(serialized.includes(stored.tokenHash), false);
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes(passwordHash), false);
    assert.equal(Object.hasOwn(response.body.data, "token"), false);
  });

  it("returns a replacement token on refresh without exposing hashes", async () => {
    const original = await createInvitation();

    const response = await owner.agent.post(
      `${endpoint()}/${original.stored.id}/refresh`,
    );

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    const nextToken = response.body.data.token;

    assert.equal(typeof nextToken, "string");
    assert.ok(nextToken.length > 0);
    assert.notEqual(nextToken, original.token);

    const stored =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: {
          id: original.stored.id,
        },
      });

    assert.equal(stored.tokenHash, hashToken(nextToken));

    assertNoSensitiveFields(response.body);

    const serialized = JSON.stringify(response.body);

    assert.equal(serialized.includes(stored.tokenHash), false);
    assert.equal(
      serialized.includes(original.stored.tokenHash),
      false,
    );
    assert.equal(serialized.includes(passwordHash), false);
  });

  it("returns a safe accepted membership with the organization name", async () => {
    const { stored, token } = await createInvitation();

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: invitedEmail,
        password,
      });

    assert.equal(
      loginResponse.status,
      200,
      JSON.stringify(loginResponse.body),
    );

    const response = await request(app)
      .post("/api/v1/auth/accept-membership-invitation")
      .set("Cookie", accessCookie(loginResponse))
      .send({ token });

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    const data = response.body.data;

    assert.equal(data.organizationId, owner.organizationId);
    assert.equal(data.userId, invitedUserId);
    assert.equal(data.role, "TECHNICIAN");
    assert.equal(data.status, "ACTIVE");
    assert.equal(data.user.email, invitedEmail);

    const organization = await prisma.organization.findUniqueOrThrow({
      where: {
        id: owner.organizationId,
      },
    });

    assert.equal(data.organizationName, organization.name);

    assert.deepEqual(
      Object.keys(data.user).sort(),
      [
        "id",
        "email",
        "firstName",
        "lastName",
        "phone",
        "isActive",
      ].sort(),
    );

    assertNoSensitiveFields(response.body);

    const serialized = JSON.stringify(response.body);

    assert.equal(serialized.includes(passwordHash), false);
    assert.equal(serialized.includes(stored.tokenHash), false);
    assert.equal(serialized.includes(token), false);
  });
});

//************************************************************** */