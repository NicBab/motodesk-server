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
  parseRefreshToken,
} from "../../../src/modules/auth/tokens/refresh-token.service.js";

//************************************************************** */

const clientAccess = "motodesk_access_token";
const clientRefresh = "motodesk_refresh_token";
const adminAccess = "motodesk_admin_access_token";
const adminRefresh = "motodesk_admin_refresh_token";

const clientRoot = "/api/v1/auth";
const adminRoot = "/api/v1/platform";

const userIds: string[] = [];

function cookieLines(response: {
  headers: Record<string, unknown>;
}): string[] {
  const value = response.headers["set-cookie"];

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return typeof value === "string" ? [value] : [];
}

function cookie(
  response: { headers: Record<string, unknown> },
  name: string,
): string {
  const line = cookieLines(response).find((value) =>
    value.startsWith(`${name}=`),
  );

  assert.ok(line, `Expected ${name} cookie.`);

  return line.split(";")[0]!;
}

function cookieValue(value: string): string {
  return decodeURIComponent(value.slice(value.indexOf("=") + 1));
}

function renameCookie(value: string, name: string): string {
  return `${name}=${value.slice(value.indexOf("=") + 1)}`;
}

async function sessionFor(refreshCookie: string) {
  const parsed = parseRefreshToken(cookieValue(refreshCookie));

  return prisma.session.findUniqueOrThrow({
    where: { id: parsed.sessionId },
  });
}

async function fixture(
  options: {
    grant?: boolean;
    verified?: boolean;
    active?: boolean;
    grantActive?: boolean;
  } = {},
) {
  const password = "MotoDeskPlatformAuth123!";

  const user = await prisma.user.create({
    data: {
      email: `platform-auth-${randomUUID()}@example.com`,
      firstName: "Platform",
      lastName: "Authentication",
      passwordHash: await hashPassword(password),
      emailVerifiedAt:
        options.verified === false ? null : new Date(),
      isActive: options.active ?? true,
    },
  });

  userIds.push(user.id);

  if (options.grant !== false) {
    await prisma.platformAdmin.create({
      data: {
        userId: user.id,
        role: "SUPER_ADMIN",
        isActive: options.grantActive ?? true,
      },
    });
  }

  const credentials = { email: user.email, password };

  return {
    user,
    credentials,

    loginClient: () =>
      request(app)
        .post(`${clientRoot}/login`)
        .send(credentials),

    loginAdmin: () =>
      request(app)
        .post(`${adminRoot}/auth/login`)
        .send(credentials),
  };
}

//************************************************************** */

describe("Platform authentication session isolation", () => {
  afterEach(async () => {
    if (userIds.length === 0) {
      return;
    }

    const ids = [...userIds];

    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: ids } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: ids } },
    });

    userIds.length = 0;
  });

  it("creates separate cookies and audiences without exposing credentials", async () => {
    const account = await fixture();

    const client = await account.loginClient();
    const admin = await account.loginAdmin();

    assert.equal(client.status, 200);
    assert.equal(admin.status, 200);

    const clientCookie = cookie(client, clientRefresh);
    const adminCookie = cookie(admin, adminRefresh);

    const clientSession = await sessionFor(clientCookie);
    const adminSession = await sessionFor(adminCookie);

    assert.equal(clientSession.audience, "CLIENT");
    assert.equal(adminSession.audience, "PLATFORM_ADMIN");
    assert.notEqual(clientSession.id, adminSession.id);

    assert.equal(admin.body.data.membership, null);
    assert.deepEqual(admin.body.data.permissions, []);
    assert.equal(admin.body.data.accessToken, undefined);
    assert.equal(admin.body.data.refreshToken, undefined);
    assert.equal(admin.body.data.user.passwordHash, undefined);

    assert.ok(
      cookieLines(admin).every(
        (line) =>
          line.includes("Path=/api/v1/platform") &&
          line.includes("HttpOnly"),
      ),
    );

    assert.ok(
      cookieLines(admin).every(
        (line) =>
          !line.startsWith(`${clientAccess}=`) &&
          !line.startsWith(`${clientRefresh}=`),
      ),
    );

    const me = await request(app)
      .get(`${adminRoot}/me`)
      .set("Cookie", cookie(admin, adminAccess));

    assert.equal(me.status, 200);
    assert.match(
      String(admin.headers["cache-control"]),
      /no-store/i,
    );
  });

  it("rejects ordinary users without creating an admin session", async () => {
    const account = await fixture({ grant: false });

    const response = await account.loginAdmin();

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "PLATFORM_ADMIN_ACCESS_REQUIRED",
    );

    assert.equal(
      await prisma.session.count({
        where: { userId: account.user.id },
      }),
      0,
    );
  });

  it("rejects unverified administrators", async () => {
    const account = await fixture({ verified: false });

    const response = await account.loginAdmin();

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "PLATFORM_ADMIN_EMAIL_VERIFICATION_REQUIRED",
    );

    assert.equal(
      await prisma.session.count({
        where: { userId: account.user.id },
      }),
      0,
    );
  });

  it("rejects inactive grants and incorrect passwords", async () => {
    const account = await fixture({ grantActive: false });

    const denied = await account.loginAdmin();
    assert.equal(denied.status, 403);

    const incorrect = await request(app)
      .post(`${adminRoot}/auth/login`)
      .send({
        ...account.credentials,
        password: "IncorrectPassword123!",
      });

    assert.equal(incorrect.status, 401);
    assert.equal(
      incorrect.body.code,
      "INVALID_CREDENTIALS",
    );
  });

  it("rejects copied access tokens in both directions", async () => {
    const account = await fixture();

    const client = await account.loginClient();
    const admin = await account.loginAdmin();

    assert.equal(client.status, 200);
    assert.equal(admin.status, 200);

    const clientAsAdmin = await request(app)
      .get(`${adminRoot}/me`)
      .set(
        "Cookie",
        renameCookie(cookie(client, clientAccess), adminAccess),
      );

    const adminAsClient = await request(app)
      .get(`${clientRoot}/me`)
      .set(
        "Cookie",
        renameCookie(cookie(admin, adminAccess), clientAccess),
      );

    assert.equal(clientAsAdmin.status, 401);
    assert.equal(adminAsClient.status, 401);

    assert.equal(
      (await sessionFor(cookie(client, clientRefresh))).revokedAt,
      null,
    );

    assert.equal(
      (await sessionFor(cookie(admin, adminRefresh))).revokedAt,
      null,
    );
  });

  it("rejects copied refresh tokens without rotating either session", async () => {
    const account = await fixture();

    const client = await account.loginClient();
    const admin = await account.loginAdmin();

    assert.equal(client.status, 200);
    assert.equal(admin.status, 200);

    const clientCookie = cookie(client, clientRefresh);
    const adminCookie = cookie(admin, adminRefresh);

    const clientBefore = await sessionFor(clientCookie);
    const adminBefore = await sessionFor(adminCookie);

    const clientAsAdmin = await request(app)
      .post(`${adminRoot}/auth/refresh`)
      .set("Cookie", renameCookie(clientCookie, adminRefresh))
      .send({});

    const adminAsClient = await request(app)
      .post(`${clientRoot}/refresh`)
      .set("Cookie", renameCookie(adminCookie, clientRefresh))
      .send({});

    assert.equal(clientAsAdmin.status, 401);
    assert.equal(adminAsClient.status, 401);

    const clientAfter = await sessionFor(clientCookie);
    const adminAfter = await sessionFor(adminCookie);

    assert.equal(clientAfter.tokenHash, clientBefore.tokenHash);
    assert.equal(adminAfter.tokenHash, adminBefore.tokenHash);
    assert.equal(clientAfter.revokedAt, null);
    assert.equal(adminAfter.revokedAt, null);
  });

  it("rejects copied logout credentials without revoking either session", async () => {
    const account = await fixture();

    const client = await account.loginClient();
    const admin = await account.loginAdmin();

    assert.equal(client.status, 200);
    assert.equal(admin.status, 200);

    const clientCookie = cookie(client, clientRefresh);
    const adminCookie = cookie(admin, adminRefresh);

    const clientAsAdmin = await request(app)
      .post(`${adminRoot}/auth/logout`)
      .set("Cookie", renameCookie(clientCookie, adminRefresh))
      .send({});

    const adminAsClient = await request(app)
      .post(`${clientRoot}/logout`)
      .set("Cookie", renameCookie(adminCookie, clientRefresh))
      .send({});

    assert.equal(clientAsAdmin.status, 401);
    assert.equal(adminAsClient.status, 401);

    assert.equal((await sessionFor(clientCookie)).revokedAt, null);
    assert.equal((await sessionFor(adminCookie)).revokedAt, null);
  });

  it("rotates admin refresh tokens and revokes confirmed reuse", async () => {
    const account = await fixture();

    const admin = await account.loginAdmin();
    assert.equal(admin.status, 200);

    const original = cookie(admin, adminRefresh);
    const before = await sessionFor(original);

    const refreshed = await request(app)
      .post(`${adminRoot}/auth/refresh`)
      .set("Cookie", original)
      .send({});

    assert.equal(refreshed.status, 200);

    const rotated = cookie(refreshed, adminRefresh);
    assert.notEqual(rotated, original);

    const after = await sessionFor(rotated);
    assert.equal(after.previousTokenHash, before.tokenHash);
    assert.notEqual(after.tokenHash, before.tokenHash);

    const replay = await request(app)
      .post(`${adminRoot}/auth/refresh`)
      .set("Cookie", original)
      .send({});

    assert.equal(replay.status, 401);

    const revoked = await sessionFor(rotated);
    assert.ok(revoked.revokedAt);
    assert.equal(revoked.revokedReason, "TOKEN_REUSE");

    const me = await request(app)
      .get(`${adminRoot}/me`)
      .set("Cookie", cookie(refreshed, adminAccess));

    assert.equal(me.status, 401);
  });

  it("allows at most one concurrent admin refresh", async () => {
    const account = await fixture();

    const admin = await account.loginAdmin();
    assert.equal(admin.status, 200);

    const original = cookie(admin, adminRefresh);

    const responses = await Promise.all([
      request(app)
        .post(`${adminRoot}/auth/refresh`)
        .set("Cookie", original)
        .send({}),

      request(app)
        .post(`${adminRoot}/auth/refresh`)
        .set("Cookie", original)
        .send({}),
    ]);

    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [200, 401],
    );
  });

  it("rechecks grants for access and refresh while allowing logout", async () => {
    const account = await fixture();

    const admin = await account.loginAdmin();
    assert.equal(admin.status, 200);

    const refreshCookie = cookie(admin, adminRefresh);
    const before = await sessionFor(refreshCookie);

    await prisma.platformAdmin.update({
      where: { userId: account.user.id },
      data: { isActive: false },
    });

    const me = await request(app)
      .get(`${adminRoot}/me`)
      .set("Cookie", cookie(admin, adminAccess));

    const refresh = await request(app)
      .post(`${adminRoot}/auth/refresh`)
      .set("Cookie", refreshCookie)
      .send({});

    assert.equal(me.status, 403);
    assert.equal(refresh.status, 403);
    assert.equal(
      (await sessionFor(refreshCookie)).tokenHash,
      before.tokenHash,
    );

    const logout = await request(app)
      .post(`${adminRoot}/auth/logout`)
      .set("Cookie", refreshCookie)
      .send({});

    assert.equal(logout.status, 200);
    assert.equal(
      (await sessionFor(refreshCookie)).revokedReason,
      "LOGOUT",
    );
  });

  it("logs out admin independently and clears only admin cookies", async () => {
    const account = await fixture();

    const client = await account.loginClient();
    const admin = await account.loginAdmin();

    assert.equal(client.status, 200);
    assert.equal(admin.status, 200);

    const logout = await request(app)
      .post(`${adminRoot}/auth/logout`)
      .set("Cookie", cookie(admin, adminRefresh))
      .send({});

    assert.equal(logout.status, 200);

    assert.ok(
      cookieLines(logout).every(
        (line) =>
          line.startsWith(`${adminAccess}=`) ||
          line.startsWith(`${adminRefresh}=`),
      ),
    );

    const clientMe = await request(app)
      .get(`${clientRoot}/me`)
      .set("Cookie", cookie(client, clientAccess));

    const adminMe = await request(app)
      .get(`${adminRoot}/me`)
      .set("Cookie", cookie(admin, adminAccess));

    assert.equal(clientMe.status, 200);
    assert.equal(adminMe.status, 401);
  });

  it("logs out client independently of admin", async () => {
    const account = await fixture();

    const client = await account.loginClient();
    const admin = await account.loginAdmin();

    assert.equal(client.status, 200);
    assert.equal(admin.status, 200);

    const logout = await request(app)
      .post(`${clientRoot}/logout`)
      .set("Cookie", cookie(client, clientRefresh))
      .send({});

    assert.equal(logout.status, 200);

    const adminMe = await request(app)
      .get(`${adminRoot}/me`)
      .set("Cookie", cookie(admin, adminAccess));

    assert.equal(adminMe.status, 200);
    assert.equal(
      (await sessionFor(cookie(admin, adminRefresh))).revokedAt,
      null,
    );
  });
});