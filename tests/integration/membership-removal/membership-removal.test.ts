import assert from "node:assert/strict";

import { describe, it } from "node:test";

import request from "supertest";

import {
  MembershipRole,
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import { app } from "../../../src/app.js";

import { hashPassword } from "../../../src/modules/auth/security/password.service.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../src/modules/audit/audit.constants.js";

import { getPermissionsForRole } from "../../../src/modules/permissions/permission.utils.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

const TEST_PASSWORD = "MotoDeskRemoval123!";

//************************************************************** */

async function createMember(
  organizationId: string,
  grantedByMembershipId: string,
  role: MembershipRole,
) {
  const suffix = `${Date.now()}-${Math.random()}`;

  const email = `membership-removal-${suffix}@motodesk.local`;

  const passwordHash = await hashPassword(TEST_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Removal",
      lastName: "Employee",
      isActive: true,
    },
  });

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

  return {
    user,
    membership,
  };
}

//************************************************************** */

async function createMemberAgent(email: string, organizationId: string) {
  const agent = request.agent(app);

  const loginResponse = await agent.post("/api/v1/auth/login").send({
    email,
    password: TEST_PASSWORD,
  });

  assert.equal(loginResponse.status, 200);

  const switchResponse = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  assert.equal(switchResponse.status, 200);

  return agent;
}

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

    const employeeAgent = await createMemberAgent(user.email, organizationId);

    const beforeResponse = await employeeAgent.get("/api/v1/auth/me");

    assert.equal(beforeResponse.status, 200);

    const removeResponse = await ownerAgent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${membership.id}`,
    );

    assert.equal(removeResponse.status, 200);

    assert.equal(removeResponse.body.success, true);

    assert.equal(removeResponse.body.data.status, MembershipStatus.REMOVED);

    const storedMembership = await prisma.membership.findUnique({
      where: {
        id: membership.id,
      },
    });

    assert.ok(storedMembership);

    assert.equal(storedMembership.status, MembershipStatus.REMOVED);

    const permissionCount = await prisma.membershipPermission.count({
      where: {
        organizationId,
        membershipId: membership.id,
      },
    });

    assert.equal(permissionCount, 0);

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

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditLog);

    const metadata = auditLog.metadata as Record<string, unknown>;

    assert.equal(metadata.actorMembershipId, ownerMembershipId);

    assert.ok(metadata.before);

    assert.ok(metadata.after);
  });

  //************************************************************** */

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
  });

  //************************************************************** */

  it("rejects a member attempting to remove their own membership", async () => {
    const { organizationId, membershipId: ownerMembershipId } =
      await createAuthenticatedAgent();

    const { user, membership } = await createMember(
      organizationId,
      ownerMembershipId,
      MembershipRole.ADMIN,
    );

    const adminAgent = await createMemberAgent(user.email, organizationId);

    const response = await adminAgent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${membership.id}`,
    );

    assert.equal(response.status, 403);

    assert.equal(response.body.code, "SELF_MEMBERSHIP_REMOVAL_FORBIDDEN");
  });

  //************************************************************** */

  it("rejects an administrator attempting to remove another administrator", async () => {
    const { organizationId, membershipId: ownerMembershipId } =
      await createAuthenticatedAgent();

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

    assert.equal(response.body.code, "ADMIN_PEER_MODIFICATION_FORBIDDEN");
  });

  //************************************************************** */

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

    const firstResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${membership.id}`,
    );

    assert.equal(firstResponse.status, 200);

    const secondResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}/memberships/${membership.id}`,
    );

    assert.equal(secondResponse.status, 409);

    assert.equal(secondResponse.body.code, "MEMBERSHIP_ALREADY_REMOVED");
  });

  //************************************************************** */

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

    assert.equal(response.status, 200);

    const storedMembership = await prisma.membership.findUnique({
      where: {
        id: membership.id,
      },
    });

    assert.ok(storedMembership);

    assert.equal(storedMembership.userId, user.id);

    assert.equal(storedMembership.organizationId, organizationId);

    assert.equal(storedMembership.status, MembershipStatus.REMOVED);
  });
});

//************************************************************** */
