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

import { getPermissionsForRole } from "../../../src/modules/permissions/permission.utils.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

const EMPLOYEE_PASSWORD = "MotoDeskStatus123!";

//************************************************************** */

async function createEmployeeAgent(
  organizationId: string,
  grantedByMembershipId: string,
) {
  const suffix = `${Date.now()}-${Math.random()}`;

  const email = `membership-status-${suffix}@motodesk.local`;

  const passwordHash = await hashPassword(EMPLOYEE_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Status",
      lastName: "Employee",
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

  const permissions = getPermissionsForRole(MembershipRole.TECHNICIAN);

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
    user,
  };
}

//************************************************************** */

describe("Membership status enforcement integration", () => {
  it("allows an active membership to continue using an existing organization session", async () => {
    const { organizationId, membershipId: ownerMembershipId } =
      await createAuthenticatedAgent();

    const { agent } = await createEmployeeAgent(
      organizationId,
      ownerMembershipId,
    );

    const response = await agent.get("/api/v1/auth/me");

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    assert.equal(response.body.data.membership.status, MembershipStatus.ACTIVE);
  });

  //************************************************************** */

  it("immediately rejects an existing organization session after the membership is suspended", async () => {
    const { organizationId, membershipId: ownerMembershipId } =
      await createAuthenticatedAgent();

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

  //************************************************************** */

  it("rejects an existing organization session when its membership no longer exists", async () => {
    const { organizationId, membershipId: ownerMembershipId } =
      await createAuthenticatedAgent();

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

    assert.equal(response.body.code, "ORGANIZATION_MEMBERSHIP_UNAVAILABLE");
  });
});

//************************************************************** */
