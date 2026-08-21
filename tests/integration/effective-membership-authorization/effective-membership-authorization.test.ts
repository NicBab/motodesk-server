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

import { Permissions } from "../../../src/modules/permissions/permission.constants.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

const EMPLOYEE_PASSWORD = "MotoDeskPermission123!";

//************************************************************** */

async function createEmployeeAgent(organizationId: string) {
  const suffix = `${Date.now()}-${Math.random()}`;

  const email = `effective-permissions-${suffix}@motodesk.local`;

  const passwordHash = await hashPassword(EMPLOYEE_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Effective",
      lastName: "Permissions",
      isActive: true,
    },
  });

  const membership = await prisma.membership.create({
    data: {
      userId: user.id,

      organizationId,

      role: MembershipRole.TECHNICIAN,

      status: MembershipStatus.ACTIVE,
    },
  });

  const agent = request.agent(app);

  const loginResponse = await agent.post("/api/v1/auth/login").send({
    email,
    password: EMPLOYEE_PASSWORD,
  });

  assert.equal(loginResponse.status, 200);

  const switchResponse = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  assert.equal(switchResponse.status, 200);

  return {
    agent,
    membership,
  };
}

//************************************************************** */

describe("Effective membership authorization integration", () => {
  it("returns stored membership permissions from auth me", async () => {
    const { organizationId, membershipId: ownerMembershipId } =
      await createAuthenticatedAgent();

    const { agent, membership } = await createEmployeeAgent(organizationId);

    await prisma.membershipPermission.createMany({
      data: [
        {
          organizationId,

          membershipId: membership.id,

          permission: Permissions.MEMBERSHIPS_VIEW,

          grantedByMembershipId: ownerMembershipId,
        },

        {
          organizationId,

          membershipId: membership.id,

          permission: Permissions.PARTS_VIEW,

          grantedByMembershipId: ownerMembershipId,
        },
      ],
    });

    const response = await agent.get("/api/v1/auth/me");

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    assert.deepEqual(
      [...response.body.data.permissions].sort(),
      [Permissions.MEMBERSHIPS_VIEW, Permissions.PARTS_VIEW].sort(),
    );
  });

  //************************************************************** */

  it("allows a non-owner when the required membership permission is granted", async () => {
    const { organizationId, membershipId: ownerMembershipId } =
      await createAuthenticatedAgent();

    const { agent, membership } = await createEmployeeAgent(organizationId);

    await prisma.membershipPermission.create({
      data: {
        organizationId,

        membershipId: membership.id,

        permission: Permissions.MEMBERSHIPS_VIEW,

        grantedByMembershipId: ownerMembershipId,
      },
    });

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships`,
    );

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);
  });

  //************************************************************** */

  it("denies a non-owner when the required membership permission is not granted", async () => {
    const { organizationId } = await createAuthenticatedAgent();

    const { agent } = await createEmployeeAgent(organizationId);

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships`,
    );

    assert.equal(response.status, 403);

    assert.equal(response.body.code, "INSUFFICIENT_PERMISSIONS");
  });

  //************************************************************** */

  it("uses stored permissions instead of the role preset for non-owners", async () => {
    const { organizationId, membershipId: ownerMembershipId } =
      await createAuthenticatedAgent();

    const { agent, membership } = await createEmployeeAgent(organizationId);

    await prisma.membershipPermission.create({
      data: {
        organizationId,

        membershipId: membership.id,

        permission: Permissions.PARTS_VIEW,

        grantedByMembershipId: ownerMembershipId,
      },
    });

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships`,
    );

    assert.equal(response.status, 403);

    assert.equal(response.body.code, "INSUFFICIENT_PERMISSIONS");
  });

  //************************************************************** */

  it("continues to give an owner implicit full access", async () => {
    const { agent, organizationId, membershipId } =
      await createAuthenticatedAgent();

    await prisma.membershipPermission.deleteMany({
      where: {
        organizationId,
        membershipId,
      },
    });

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships`,
    );

    assert.equal(response.status, 200);

    const meResponse = await agent.get("/api/v1/auth/me");

    assert.equal(meResponse.status, 200);

    assert.equal(meResponse.body.success, true);

    assert.equal(
      meResponse.body.data.permissions.includes(Permissions.MEMBERSHIPS_VIEW),
      true,
    );
  });
});

//************************************************************** */
