import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  after,
  describe,
  it,
} from "node:test";

import request from "supertest";

import {
  MembershipRole,
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";
import { app } from "../../../src/app.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

import {
  getPermissionsForRole,
} from "../../../src/modules/permissions/permission.utils.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

const EMPLOYEE_PASSWORD = "MotoDeskStatus123!";
const createdUserIds: string[] = [];

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

async function createEmployeeAgent(
  organizationId: string,
  grantedByMembershipId: string,
) {
  const email =
    `membership-status-${randomUUID()}@example.com`;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(EMPLOYEE_PASSWORD),
      firstName: "Status",
      lastName: "Employee",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  createdUserIds.push(user.id);

  const membership = await prisma.membership.create({
    data: {
      userId: user.id,
      organizationId,
      role: MembershipRole.TECHNICIAN,
      status: MembershipStatus.ACTIVE,
    },
  });

  const permissions = getPermissionsForRole(
    MembershipRole.TECHNICIAN,
  );

  if (permissions.length > 0) {
    await prisma.membershipPermission.createMany({
      data: permissions.map((permission) => ({
        organizationId,
        membershipId: membership.id,
        permission,
        grantedByMembershipId,
      })),
    });
  }

  const agent = request.agent(app);

  const loginResponse = await agent
    .post("/api/v1/auth/login")
    .send({
      email,
      password: EMPLOYEE_PASSWORD,
    });

  assert.equal(
    loginResponse.status,
    200,
    JSON.stringify(loginResponse.body),
  );

  agent.set("Cookie", accessCookie(loginResponse));

  const switchResponse = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  assert.equal(
    switchResponse.status,
    200,
    JSON.stringify(switchResponse.body),
  );

  agent.set("Cookie", accessCookie(switchResponse));

  return {
    agent,
    membership,
    user,
  };
}

after(async () => {
  if (createdUserIds.length === 0) {
    return;
  }

  await prisma.auditLog.deleteMany({
    where: {
      actorUserId: {
        in: createdUserIds,
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: {
        in: createdUserIds,
      },
    },
  });
});

//************************************************************** */

describe("Membership status enforcement integration", () => {
  it("allows an active membership to continue using an existing organization session", async () => {
    const {
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { agent } = await createEmployeeAgent(
      organizationId,
      ownerMembershipId,
    );

    const response = await agent.get("/api/v1/auth/me");

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );
    assert.equal(response.body.success, true);

    assert.equal(
      response.body.data.membership.status,
      MembershipStatus.ACTIVE,
    );
    assert.equal(
      response.body.data.membership.organizationId,
      organizationId,
    );
  });

  it("immediately rejects an existing organization session after the membership is suspended", async () => {
    const {
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { agent, membership } = await createEmployeeAgent(
      organizationId,
      ownerMembershipId,
    );

    const beforeResponse = await agent.get("/api/v1/auth/me");

    assert.equal(beforeResponse.status, 200);

    await prisma.membership.update({
      where: {
        id: membership.id,
      },

      data: {
        status: MembershipStatus.SUSPENDED,
      },
    });

    const afterResponse = await agent.get("/api/v1/auth/me");

    assert.equal(afterResponse.status, 401);

    assert.equal(
      afterResponse.body.code,
      "ORGANIZATION_MEMBERSHIP_UNAVAILABLE",
    );
  });

  it("rejects an existing organization session when its membership no longer exists", async () => {
    const {
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { agent, membership } = await createEmployeeAgent(
      organizationId,
      ownerMembershipId,
    );

    await prisma.membership.delete({
      where: {
        id: membership.id,
      },
    });

    const response = await agent.get("/api/v1/auth/me");

    assert.equal(response.status, 401);

    assert.equal(
      response.body.code,
      "ORGANIZATION_MEMBERSHIP_UNAVAILABLE",
    );
  });
});

//************************************************************** */