import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

import {
  createPasswordResetAuthToken,
} from "../../../src/modules/auth/tokens/one-time-token.service.js";

import {
  parseRefreshToken,
} from "../../../src/modules/auth/tokens/refresh-token.service.js";

//************************************************************** */

const clientRoot = "/api/v1/auth";
const platformRoot = "/api/v1/platform";

const password = "MotoDeskRevocation123!";
const newPassword = "MotoDeskUpdated456!";

const userIds: string[] = [];

type LoginResponse = {
  status: number;
  headers: Record<string, unknown>;
};

type SessionCredentials = {
  id: string;
  accessCookie: string;
  refreshCookie: string;
};

function readCookie(
  response: LoginResponse,
  name: string,
): string {
  const header = response.headers["set-cookie"];

  const lines = Array.isArray(header)
    ? header.map(String)
    : typeof header === "string"
      ? [header]
      : [];

  const line = lines.find((value) =>
    value.startsWith(`${name}=`),
  );

  assert.ok(line, `Expected ${name} cookie.`);

  return line.split(";")[0]!;
}

function credentials(
  response: LoginResponse,
  admin: boolean,
): SessionCredentials {
  assert.equal(response.status, 200);

  const prefix = admin ? "motodesk_admin" : "motodesk";

  const accessCookie = readCookie(
    response,
    `${prefix}_access_token`,
  );

  const refreshCookie = readCookie(
    response,
    `${prefix}_refresh_token`,
  );

  const token = decodeURIComponent(
    refreshCookie.slice(refreshCookie.indexOf("=") + 1),
  );

  return {
    id: parseRefreshToken(token).sessionId,
    accessCookie,
    refreshCookie,
  };
}

//************************************************************** */

async function createFixture() {
  const user = await prisma.user.create({
    data: {
      email: `session-revocation-${randomUUID()}@example.com`,
      firstName: "Session",
      lastName: "Revocation",
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
    },
  });

  userIds.push(user.id);

  await prisma.platformAdmin.create({
    data: {
      userId: user.id,
      role: "SUPER_ADMIN",
    },
  });

  const input = {
    email: user.email,
    password,
  };

  const primary = credentials(
    await request(app)
      .post(`${clientRoot}/login`)
      .send(input),
    false,
  );

  const secondary = credentials(
    await request(app)
      .post(`${clientRoot}/login`)
      .send(input),
    false,
  );

  const admin = credentials(
    await request(app)
      .post(`${platformRoot}/auth/login`)
      .send(input),
    true,
  );

  return {
    user,
    primary,
    secondary,
    admin,
  };
}

//************************************************************** */

async function assertRevoked(
  session: SessionCredentials,
  admin: boolean,
  reason: "LOGOUT_ALL" | "PASSWORD_CHANGED" | "PASSWORD_RESET",
): Promise<void> {
  const stored = await prisma.session.findUniqueOrThrow({
    where: { id: session.id },
  });

  assert.ok(stored.revokedAt);
  assert.equal(stored.revokedReason, reason);
  assert.equal(
    stored.audience,
    admin ? "PLATFORM_ADMIN" : "CLIENT",
  );

  const access = await request(app)
    .get(admin ? `${platformRoot}/me` : `${clientRoot}/me`)
    .set("Cookie", session.accessCookie);

  assert.equal(access.status, 401);

  const refresh = await request(app)
    .post(
      admin
        ? `${platformRoot}/auth/refresh`
        : `${clientRoot}/refresh`,
    )
    .set("Cookie", session.refreshCookie)
    .send({});

  assert.equal(refresh.status, 401);
}

//************************************************************** */

describe("Account-wide client and admin session revocation", () => {
  afterEach(async () => {
    if (userIds.length === 0) {
      return;
    }

    const ids = [...userIds];

    await prisma.auditLog.deleteMany({
      where: {
        actorUserId: { in: ids },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    userIds.length = 0;
  });

  it("sign out everywhere revokes client and admin sessions", async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .post(`${clientRoot}/logout-all`)
      .set("Cookie", fixture.primary.accessCookie)
      .send({});

    assert.equal(response.status, 200);
    assert.equal(response.body.data.revokedSessionCount, 3);

    await assertRevoked(
      fixture.primary,
      false,
      "LOGOUT_ALL",
    );

    await assertRevoked(
      fixture.secondary,
      false,
      "LOGOUT_ALL",
    );

    await assertRevoked(
      fixture.admin,
      true,
      "LOGOUT_ALL",
    );
  });

  it("password changes preserve the initiating session and revoke other audiences", async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .post(`${clientRoot}/change-password`)
      .set("Cookie", fixture.primary.accessCookie)
      .send({
        currentPassword: password,
        newPassword,
        confirmNewPassword: newPassword,
      });

    assert.equal(response.status, 200);

    await assertRevoked(
      fixture.secondary,
      false,
      "PASSWORD_CHANGED",
    );

    await assertRevoked(
      fixture.admin,
      true,
      "PASSWORD_CHANGED",
    );

    const current = await prisma.session.findUniqueOrThrow({
      where: { id: fixture.primary.id },
    });

    assert.equal(current.revokedAt, null);

    const me = await request(app)
      .get(`${clientRoot}/me`)
      .set("Cookie", fixture.primary.accessCookie);

    assert.equal(me.status, 200);

    const refresh = await request(app)
      .post(`${clientRoot}/refresh`)
      .set("Cookie", fixture.primary.refreshCookie)
      .send({});

    assert.equal(refresh.status, 200);

    const oldPasswordLogin = await request(app)
      .post(`${platformRoot}/auth/login`)
      .send({
        email: fixture.user.email,
        password,
      });

    assert.equal(oldPasswordLogin.status, 401);

    const newPasswordLogin = await request(app)
      .post(`${platformRoot}/auth/login`)
      .send({
        email: fixture.user.email,
        password: newPassword,
      });

    assert.equal(newPasswordLogin.status, 200);
  });

  it("password resets revoke all audiences and consume the reset credential", async () => {
    const fixture = await createFixture();

    // Generate the existing one-time credential directly so the test
    // does not depend on email delivery.
    const reset = await createPasswordResetAuthToken(
      fixture.user.id,
    );

    const input = {
      token: reset.token,
      password: newPassword,
      confirmPassword: newPassword,
    };

    const response = await request(app)
      .post(`${clientRoot}/reset-password`)
      .send(input);

    assert.equal(response.status, 200);

    await assertRevoked(
      fixture.primary,
      false,
      "PASSWORD_RESET",
    );

    await assertRevoked(
      fixture.secondary,
      false,
      "PASSWORD_RESET",
    );

    await assertRevoked(
      fixture.admin,
      true,
      "PASSWORD_RESET",
    );

    const replay = await request(app)
      .post(`${clientRoot}/reset-password`)
      .send(input);

    assert.equal(replay.status, 400);
    assert.equal(
      replay.body.code,
      "PASSWORD_RESET_TOKEN_INVALID",
    );

    const oldPasswordLogin = await request(app)
      .post(`${platformRoot}/auth/login`)
      .send({
        email: fixture.user.email,
        password,
      });

    assert.equal(oldPasswordLogin.status, 401);

    const newPasswordLogin = await request(app)
      .post(`${platformRoot}/auth/login`)
      .send({
        email: fixture.user.email,
        password: newPassword,
      });

    assert.equal(newPasswordLogin.status, 200);
  });
});