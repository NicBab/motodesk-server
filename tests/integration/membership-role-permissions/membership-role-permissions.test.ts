import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { MembershipRole } from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import { Permissions } from "../../../src/modules/permissions/permission.constants.js";

import { getPermissionsForRole } from "../../../src/modules/permissions/permission.utils.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

async function createEmployeeMembership(organizationId: string) {
  const suffix = `${Date.now()}-${Math.random()}`;

  const user = await prisma.user.create({
    data: {
      email: `role-permission-sync-${suffix}@motodesk.test`,

      passwordHash: "integration-test-not-used",

      firstName: "Role",

      lastName: "Permission",
    },
  });

  return prisma.membership.create({
    data: {
      userId: user.id,

      organizationId,

      role: MembershipRole.TECHNICIAN,

      status: "ACTIVE",
    },
  });
}

//************************************************************** */

describe("Membership role permission sync integration", () => {
  it("resets membership permissions to the new role preset when role changes", async () => {
    const {
      agent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const employee = await createEmployeeMembership(organizationId);

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
      .patch(
        `/api/v1/organizations/${organizationId}/memberships/${employee.id}`,
      )
      .send({
        role: MembershipRole.SERVICE_ADVISOR,
      });

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    assert.equal(response.body.data.role, MembershipRole.SERVICE_ADVISOR);

    const storedPermissions = await prisma.membershipPermission.findMany({
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
        (permission) => permission.grantedByMembershipId === ownerMembershipId,
      ),
      true,
    );
  });

  //************************************************************** */

  it("preserves custom permissions when only membership status changes", async () => {
    const {
      agent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const employee = await createEmployeeMembership(organizationId);

    await prisma.membershipPermission.create({
      data: {
        organizationId,

        membershipId: employee.id,

        permission: Permissions.PARTS_VIEW,

        grantedByMembershipId: ownerMembershipId,
      },
    });

    const response = await agent
      .patch(
        `/api/v1/organizations/${organizationId}/memberships/${employee.id}`,
      )
      .send({
        status: "SUSPENDED",
      });

    assert.equal(response.status, 200);

    const storedPermissions = await prisma.membershipPermission.findMany({
      where: {
        organizationId,
        membershipId: employee.id,
      },
    });

    assert.equal(storedPermissions.length, 1);

    assert.equal(storedPermissions[0]?.permission, Permissions.PARTS_VIEW);
  });
});

//************************************************************** */
