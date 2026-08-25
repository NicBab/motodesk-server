import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { MembershipRole } from "../../../src/generated/prisma/client.js";

import { Permissions } from "../../../src/modules/permissions/permission.constants.js";

import { getPermissionsForRole } from "../../../src/modules/permissions/permission.utils.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Permission catalog integration", () => {
  it("returns the complete permission catalog", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/permission-catalog`,
    );

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    const catalog = response.body.data;

    const returnedPermissions = catalog.permissions.map(
      (item: { permission: string }) => item.permission,
    );

    const expectedPermissions = Object.values(Permissions);

    assert.deepEqual(
      [...returnedPermissions].sort(),
      [...expectedPermissions].sort(),
    );
  });

  //************************************************************** */

  it("returns group and action metadata for every permission", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/permission-catalog`,
    );

    assert.equal(response.status, 200);

    const permissions = response.body.data.permissions;

    assert.equal(permissions.length > 0, true);

    for (const permission of permissions) {
      assert.equal(typeof permission.permission, "string");

      assert.equal(typeof permission.group, "string");

      assert.equal(typeof permission.action, "string");

      assert.equal(permission.group.length > 0, true);
    }
  });

  //************************************************************** */

  it("returns the server role defaults for every membership role", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/permission-catalog`,
    );

    assert.equal(response.status, 200);

    const roleDefaults = response.body.data.roleDefaults;

    const roles = [
      MembershipRole.OWNER,
      MembershipRole.ADMIN,
      MembershipRole.MANAGER,
      MembershipRole.SERVICE_ADVISOR,
      MembershipRole.TECHNICIAN,
      MembershipRole.PARTS,
    ];

    for (const role of roles) {
      const expected = getPermissionsForRole(role);

      const actual = roleDefaults[role];

      assert.ok(Array.isArray(actual));

      assert.deepEqual([...actual].sort(), [...expected].sort());
    }
  });

  //************************************************************** */

  it("includes the full permission set for the owner role", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/permission-catalog`,
    );

    assert.equal(response.status, 200);

    const ownerPermissions =
      response.body.data.roleDefaults[MembershipRole.OWNER];

    assert.deepEqual(
      [...ownerPermissions].sort(),
      [...Object.values(Permissions)].sort(),
    );
  });
});

//************************************************************** */
