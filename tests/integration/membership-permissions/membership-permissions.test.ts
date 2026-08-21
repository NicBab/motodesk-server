import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

import { Permissions } from "../../../src/modules/permissions/permission.constants.js";

//************************************************************** */

async function createEmployeeMembership(organizationId: string) {
  const suffix = `${Date.now()}-${Math.random()}`;

  const user = await prisma.user.create({
    data: {
      email: `membership-permissions-${suffix}@motodesk.test`,

      passwordHash: "integration-test-not-used",

      firstName: "Permission",

      lastName: "Employee",
    },
  });

  return prisma.membership.create({
    data: {
      userId: user.id,

      organizationId,

      role: "TECHNICIAN",

      status: "ACTIVE",
    },
  });
}

//************************************************************** */

describe("Membership permissions integration", () => {
  it("allows an owner to assign and retrieve employee permissions", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const employee = await createEmployeeMembership(organizationId);

    //************************************************************** */
    // Update Permissions

    const updateResponse = await agent
      .put(
        `/api/v1/organizations/${organizationId}/memberships/${employee.id}/permissions`,
      )
      .send({
        permissions: [
          Permissions.REPAIR_ORDERS_VIEW,
          Permissions.REPAIR_ORDERS_UPDATE,
          Permissions.PARTS_VIEW,
          Permissions.INVENTORY_VIEW,
        ],
      });

    assert.equal(updateResponse.status, 200);

    assert.equal(updateResponse.body.success, true);

    assert.deepEqual(
      [...updateResponse.body.data.permissions].sort(),
      [
        Permissions.INVENTORY_VIEW,
        Permissions.PARTS_VIEW,
        Permissions.REPAIR_ORDERS_UPDATE,
        Permissions.REPAIR_ORDERS_VIEW,
      ].sort(),
    );

    //************************************************************** */
    // Verify Database

    const storedPermissions = await prisma.membershipPermission.findMany({
      where: {
        organizationId,
        membershipId: employee.id,
      },

      orderBy: {
        permission: "asc",
      },
    });

    assert.equal(storedPermissions.length, 4);

    assert.equal(
      storedPermissions.every(
        (permission) => permission.grantedByMembershipId !== null,
      ),
      true,
    );

    //************************************************************** */
    // Get Permissions

    const getResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships/${employee.id}/permissions`,
    );

    assert.equal(getResponse.status, 200);

    assert.equal(getResponse.body.success, true);

    assert.deepEqual(
      [...getResponse.body.data.permissions].sort(),
      [
        Permissions.INVENTORY_VIEW,
        Permissions.PARTS_VIEW,
        Permissions.REPAIR_ORDERS_UPDATE,
        Permissions.REPAIR_ORDERS_VIEW,
      ].sort(),
    );
  });

  //************************************************************** */

  it("replaces the previous employee permission set", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const employee = await createEmployeeMembership(organizationId);

    //************************************************************** */
    // Initial Permissions

    const initialResponse = await agent
      .put(
        `/api/v1/organizations/${organizationId}/memberships/${employee.id}/permissions`,
      )
      .send({
        permissions: [Permissions.REPAIR_ORDERS_VIEW, Permissions.PARTS_VIEW],
      });

    assert.equal(initialResponse.status, 200);

    //************************************************************** */
    // Replace Permissions

    const replaceResponse = await agent
      .put(
        `/api/v1/organizations/${organizationId}/memberships/${employee.id}/permissions`,
      )
      .send({
        permissions: [Permissions.SCHEDULING_VIEW],
      });

    assert.equal(replaceResponse.status, 200);

    assert.deepEqual(replaceResponse.body.data.permissions, [
      Permissions.SCHEDULING_VIEW,
    ]);

    const storedPermissions = await prisma.membershipPermission.findMany({
      where: {
        organizationId,
        membershipId: employee.id,
      },
    });

    assert.equal(storedPermissions.length, 1);

    assert.equal(storedPermissions[0]?.permission, Permissions.SCHEDULING_VIEW);
  });

  //************************************************************** */

  it("allows an owner to remove all employee permissions", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const employee = await createEmployeeMembership(organizationId);

    await agent
      .put(
        `/api/v1/organizations/${organizationId}/memberships/${employee.id}/permissions`,
      )
      .send({
        permissions: [Permissions.PARTS_VIEW],
      });

    //************************************************************** */
    // Remove All

    const response = await agent
      .put(
        `/api/v1/organizations/${organizationId}/memberships/${employee.id}/permissions`,
      )
      .send({
        permissions: [],
      });

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    assert.deepEqual(response.body.data.permissions, []);

    const count = await prisma.membershipPermission.count({
      where: {
        organizationId,
        membershipId: employee.id,
      },
    });

    assert.equal(count, 0);
  });

  //************************************************************** */

  it("rejects modification of owner permissions", async () => {
    const { agent, organizationId, membershipId } =
      await createAuthenticatedAgent();

    const response = await agent
      .put(
        `/api/v1/organizations/${organizationId}/memberships/${membershipId}/permissions`,
      )
      .send({
        permissions: [Permissions.CUSTOMERS_VIEW],
      });

    assert.equal(response.status, 403);

    assert.equal(response.body.code, "OWNER_PROTECTED");
  });

  //************************************************************** */

  it("rejects invalid permission values", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const employee = await createEmployeeMembership(organizationId);

    const response = await agent
      .put(
        `/api/v1/organizations/${organizationId}/memberships/${employee.id}/permissions`,
      )
      .send({
        permissions: ["not:a:real:permission"],
      });

    assert.equal(response.status, 400);
  });
});

//************************************************************** */
