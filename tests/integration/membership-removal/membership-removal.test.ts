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
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../src/modules/audit/audit.constants.js";

import {
  getPermissionsForRole,
} from "../../../src/modules/permissions/permission.utils.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

const TEST_PASSWORD = "MotoDeskRemoval123!";
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

async function createMember(
  organizationId: string,
  grantedByMembershipId: string,
  role: MembershipRole,
) {
  const user = await prisma.user.create({
    data: {
      email: `membership-removal-${randomUUID()}@example.com`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      firstName: "Removal",
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
      role,
      status: MembershipStatus.ACTIVE,
    },
  });

  const permissions = getPermissionsForRole(role);

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

  return { user, membership };
}

async function createMemberAgent(
  email: string,
  organizationId: string,
) {
  const agent = request.agent(app);

  const loginResponse = await agent
    .post("/api/v1/auth/login")
    .send({
      email,
      password: TEST_PASSWORD,
    });

  assert.equal(
    loginResponse.status,
    200,
    JSON.stringify(loginResponse.body),
  );

  agent.set("Cookie", accessCookie(loginResponse));

  const switchResponse = await agent
    .post("/api/v1/auth/switch-organization")
    .send({ organizationId });

  assert.equal(
    switchResponse.status,
    200,
    JSON.stringify(switchResponse.body),
  );

  agent.set("Cookie", accessCookie(switchResponse));

  return agent;
}

after(async () => {
  if (createdUserIds.length === 0) {
    return;
  }

  await prisma.auditLog.deleteMany({
    where: {
      actorUserId: { in: createdUserIds },
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: { in: createdUserIds },
    },
  });
});

//************************************************************** */

describe("Membership removal integration", () => {
  it("soft removes a member, clears permissions, invalidates the existing organization session, and records the audit event", async () => {
    const {
      agent: ownerAgent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { user, membership } = await createMember(
      organizationId,
      ownerMembershipId,
      MembershipRole.TECHNICIAN,
    );

    const employeeAgent = await createMemberAgent(
      user.email,
      organizationId,
    );

    assert.equal(
      (await employeeAgent.get("/api/v1/auth/me")).status,
      200,
    );

    const response = await ownerAgent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${membership.id}`,
    );

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, MembershipStatus.REMOVED);

    const stored = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });

    assert.equal(stored.status, MembershipStatus.REMOVED);

    assert.equal(
      await prisma.membershipPermission.count({
        where: {
          organizationId,
          membershipId: membership.id,
        },
      }),
      0,
    );

    const afterResponse = await employeeAgent.get("/api/v1/auth/me");

    assert.equal(afterResponse.status, 401);
    assert.equal(
      afterResponse.body.code,
      "ORGANIZATION_MEMBERSHIP_UNAVAILABLE",
    );

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,
        action: AUDIT_ACTIONS.MEMBERSHIP_REMOVED,
        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
        resourceId: membership.id,
      },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(auditLog);

    const metadata = auditLog.metadata as Record<string, unknown>;

    assert.equal(metadata.actorMembershipId, ownerMembershipId);
    assert.ok(metadata.before);
    assert.ok(metadata.after);
  });

  it("requires recent authentication before removing a membership", async () => {
    const {
      agent: ownerAgent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { membership } = await createMember(
      organizationId,
      ownerMembershipId,
      MembershipRole.TECHNICIAN,
    );

    const sessionsResponse = await ownerAgent.get(
      "/api/v1/auth/sessions",
    );

    assert.equal(sessionsResponse.status, 200);
    assert.equal(sessionsResponse.body.success, true);

    const currentSession =
      sessionsResponse.body.data.sessions.find(
        (session: { id: string; isCurrent: boolean }) =>
          session.isCurrent === true,
      );

    assert.ok(currentSession);

    await prisma.session.update({
      where: { id: currentSession.id },
      data: {
        lastAuthenticatedAt:
          new Date("2000-01-01T00:00:00.000Z"),
      },
    });

    const response = await ownerAgent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${membership.id}`,
    );

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
    assert.equal(
      response.body.code,
      "RECENT_AUTHENTICATION_REQUIRED",
    );

    const stored = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });

    assert.equal(stored.status, MembershipStatus.ACTIVE);

    assert.equal(
      await prisma.membershipPermission.count({
        where: {
          organizationId,
          membershipId: membership.id,
        },
      }),
      getPermissionsForRole(MembershipRole.TECHNICIAN).length,
    );

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,
        action: AUDIT_ACTIONS.MEMBERSHIP_REMOVED,
        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
        resourceId: membership.id,
      },
    });

    assert.equal(auditLog, null);
  });

  it("rejects removal of the owner membership", async () => {
    const {
      agent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const response = await agent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${ownerMembershipId}`,
    );

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "OWNER_PROTECTED");

    const owner = await prisma.membership.findUniqueOrThrow({
      where: { id: ownerMembershipId },
    });

    assert.equal(owner.role, MembershipRole.OWNER);
    assert.equal(owner.status, MembershipStatus.ACTIVE);
  });

  it("rejects a member attempting to remove their own membership", async () => {
    const {
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { user, membership } = await createMember(
      organizationId,
      ownerMembershipId,
      MembershipRole.ADMIN,
    );

    const adminAgent = await createMemberAgent(
      user.email,
      organizationId,
    );

    const response = await adminAgent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${membership.id}`,
    );

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "SELF_MEMBERSHIP_REMOVAL_FORBIDDEN",
    );
  });

  it("rejects an administrator attempting to remove another administrator", async () => {
    const {
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const firstAdmin = await createMember(
      organizationId,
      ownerMembershipId,
      MembershipRole.ADMIN,
    );

    const secondAdmin = await createMember(
      organizationId,
      ownerMembershipId,
      MembershipRole.ADMIN,
    );

    const adminAgent = await createMemberAgent(
      firstAdmin.user.email,
      organizationId,
    );

    const response = await adminAgent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${secondAdmin.membership.id}`,
    );

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "ADMIN_PEER_MODIFICATION_FORBIDDEN",
    );
  });

  it("rejects a second removal attempt for an already removed membership", async () => {
    const {
      agent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { membership } = await createMember(
      organizationId,
      ownerMembershipId,
      MembershipRole.PARTS,
    );

    const endpoint =
      `/api/v1/organizations/${organizationId}/memberships/${membership.id}`;

    const firstResponse = await agent.delete(endpoint);

    assert.equal(
      firstResponse.status,
      200,
      JSON.stringify(firstResponse.body),
    );

    const secondResponse = await agent.delete(endpoint);

    assert.equal(secondResponse.status, 409);
    assert.equal(
      secondResponse.body.code,
      "MEMBERSHIP_ALREADY_REMOVED",
    );
  });

  it("preserves the membership record after removal", async () => {
    const {
      agent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { user, membership } = await createMember(
      organizationId,
      ownerMembershipId,
      MembershipRole.SERVICE_ADVISOR,
    );

    const response = await agent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${membership.id}`,
    );

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    const stored = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });

    assert.equal(stored.userId, user.id);
    assert.equal(stored.organizationId, organizationId);
    assert.equal(stored.status, MembershipStatus.REMOVED);
  });
});

//************************************************************** */