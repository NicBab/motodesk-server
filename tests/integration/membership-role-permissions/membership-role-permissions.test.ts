import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  after,
  describe,
  it,
} from "node:test";

import {
  MembershipRole,
} from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import {
  Permissions,
} from "../../../src/modules/permissions/permission.constants.js";

import {
  getPermissionsForRole,
} from "../../../src/modules/permissions/permission.utils.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

const createdUserIds: string[] = [];

async function createEmployeeMembership(
  organizationId: string,
) {
  const user = await prisma.user.create({
    data: {
      email: `role-permission-${randomUUID()}@example.com`,
      passwordHash: "integration-test-not-used",
      firstName: "Role",
      lastName: "Permission",
      emailVerifiedAt: new Date(),
    },
  });

  createdUserIds.push(user.id);

  return prisma.membership.create({
    data: {
      userId: user.id,
      organizationId,
      role: MembershipRole.TECHNICIAN,
      status: "ACTIVE",
    },
  });
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

describe("Membership role permission sync integration", () => {
  it("resets membership permissions to the new role preset when role changes", async () => {
    const {
      agent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const employee = await createEmployeeMembership(
      organizationId,
    );

    await prisma.membershipPermission.createMany({
      data: [
        {
          organizationId,
          membershipId: employee.id,
          permission: Permissions.PARTS_VIEW,
          grantedByMembershipId: ownerMembershipId,
        },
        {
          organizationId,
          membershipId: employee.id,
          permission: Permissions.PURCHASE_ORDERS_VIEW,
          grantedByMembershipId: ownerMembershipId,
        },
      ],
    });

    const response = await agent
      .patch(`/api/v1/organizations/${organizationId}/memberships/${employee.id}`)
      .send({
        role: MembershipRole.SERVICE_ADVISOR,
      });

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );
    assert.equal(response.body.success, true);

    assert.equal(
      response.body.data.role,
      MembershipRole.SERVICE_ADVISOR,
    );

    const storedPermissions =
      await prisma.membershipPermission.findMany({
        where: {
          organizationId,
          membershipId: employee.id,
        },

        orderBy: {
          permission: "asc",
        },
      });

    const actualPermissions = storedPermissions.map(
      (permission) => permission.permission,
    );

    const expectedPermissions = getPermissionsForRole(
      MembershipRole.SERVICE_ADVISOR,
    );

    assert.deepEqual(
      [...actualPermissions].sort(),
      [...expectedPermissions].sort(),
    );

    assert.equal(
      storedPermissions.every(
        (permission) =>
          permission.grantedByMembershipId === ownerMembershipId,
      ),
      true,
    );
  });

  it("preserves custom permissions when only membership status changes", async () => {
    const {
      agent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const employee = await createEmployeeMembership(
      organizationId,
    );

    await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: employee.id,
        permission: Permissions.PARTS_VIEW,
        grantedByMembershipId: ownerMembershipId,
      },
    });

    const response = await agent
      .patch(`/api/v1/organizations/${organizationId}/memberships/${employee.id}`)
      .send({
        status: "SUSPENDED",
      });

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    const storedPermissions =
      await prisma.membershipPermission.findMany({
        where: {
          organizationId,
          membershipId: employee.id,
        },
      });

    assert.equal(storedPermissions.length, 1);

    assert.equal(
      storedPermissions[0]!.permission,
      Permissions.PARTS_VIEW,
    );

    const membership =
      await prisma.membership.findUniqueOrThrow({
        where: {
          id: employee.id,
        },
      });

    assert.equal(membership.status, "SUSPENDED");
  });

  it("requires recent authentication before changing membership role or status", async () => {
    const {
      agent,
      organizationId,
    } = await createAuthenticatedAgent();

    const employee = await createEmployeeMembership(
      organizationId,
    );

    const sessionsResponse = await agent.get(
      "/api/v1/auth/sessions",
    );

    assert.equal(
      sessionsResponse.status,
      200,
      JSON.stringify(sessionsResponse.body),
    );
    assert.equal(sessionsResponse.body.success, true);

    const currentSession =
      sessionsResponse.body.data.sessions.find(
        (session: { id: string; isCurrent: boolean }) =>
          session.isCurrent === true,
      );

    assert.ok(currentSession);

    await prisma.session.update({
      where: {
        id: currentSession.id,
      },

      data: {
        lastAuthenticatedAt:
          new Date("2000-01-01T00:00:00.000Z"),
      },
    });

    const endpoint =
      `/api/v1/organizations/${organizationId}/memberships/${employee.id}`;

    const roleResponse = await agent
      .patch(endpoint)
      .send({
        role: MembershipRole.SERVICE_ADVISOR,
      });

    assert.equal(roleResponse.status, 403);
    assert.equal(roleResponse.body.success, false);

    assert.equal(
      roleResponse.body.code,
      "RECENT_AUTHENTICATION_REQUIRED",
    );

    const statusResponse = await agent
      .patch(endpoint)
      .send({
        status: "SUSPENDED",
      });

    assert.equal(statusResponse.status, 403);
    assert.equal(statusResponse.body.success, false);

    assert.equal(
      statusResponse.body.code,
      "RECENT_AUTHENTICATION_REQUIRED",
    );

    const storedMembership =
      await prisma.membership.findUniqueOrThrow({
        where: {
          id: employee.id,
        },
      });

    assert.equal(
      storedMembership.role,
      MembershipRole.TECHNICIAN,
    );
    assert.equal(storedMembership.status, "ACTIVE");
  });
});

//************************************************************** */