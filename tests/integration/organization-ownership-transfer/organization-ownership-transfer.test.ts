import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  MembershipRole,
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../src/modules/audit/audit.constants.js";

import { getPermissionsForRole } from "../../../src/modules/permissions/permission.utils.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

function createSafeSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

//************************************************************** */

async function createOwnershipTestOrganization() {
  const { agent } = await createAuthenticatedAgent();

  const suffix = createSafeSuffix();

  const createResponse = await agent.post("/api/v1/organizations").send({
    name: `Ownership Transfer ${suffix}`,

    slug: `ownership-transfer-${suffix}`,
  });

  assert.equal(createResponse.status, 201);

  const organizationId = createResponse.body.data.id;

  const switchResponse = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  assert.equal(switchResponse.status, 200);

  const ownerMembership = await prisma.membership.findFirstOrThrow({
    where: {
      organizationId,
      role: MembershipRole.OWNER,
    },
  });

  return {
    agent,
    organizationId,

    ownerMembershipId: ownerMembership.id,

    ownerUserId: ownerMembership.userId,
  };
}

//************************************************************** */

async function createTransferTarget(
  organizationId: string,
  grantedByMembershipId: string,
  role: MembershipRole = MembershipRole.MANAGER,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  const suffix = createSafeSuffix();

  const user = await prisma.user.create({
    data: {
      email: `ownership-target-${suffix}@motodesk.local`,

      passwordHash: "integration-test-not-used",

      firstName: "Ownership",

      lastName: "Target",

      isActive: true,
    },
  });

  const membership = await prisma.membership.create({
    data: {
      organizationId,

      userId: user.id,

      role,

      status,
    },
  });

  const permissions = getPermissionsForRole(role);

  if (permissions.length > 0 && status === MembershipStatus.ACTIVE) {
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

describe("Organization ownership transfer integration", () => {
  it("transfers ownership to an active membership and synchronizes both permission sets", async () => {
    const { agent, organizationId, ownerMembershipId } =
      await createOwnershipTestOrganization();

    const { membership: targetMembership } = await createTransferTarget(
      organizationId,
      ownerMembershipId,
      MembershipRole.MANAGER,
    );

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/transfer-ownership`)
      .send({
        membershipId: targetMembership.id,
      });

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    const newOwner = await prisma.membership.findUniqueOrThrow({
      where: {
        id: targetMembership.id,
      },
    });

    const previousOwner = await prisma.membership.findUniqueOrThrow({
      where: {
        id: ownerMembershipId,
      },
    });

    assert.equal(newOwner.role, MembershipRole.OWNER);

    assert.equal(previousOwner.role, MembershipRole.ADMIN);

    //************************************************************** */
    // New Owner Permissions

    const newOwnerPermissionRows = await prisma.membershipPermission.findMany({
      where: {
        organizationId,

        membershipId: newOwner.id,
      },
    });

    const actualNewOwnerPermissions = newOwnerPermissionRows.map(
      (record) => record.permission,
    );

    const expectedNewOwnerPermissions = getPermissionsForRole(
      MembershipRole.OWNER,
    );

    assert.deepEqual(
      [...actualNewOwnerPermissions].sort(),
      [...expectedNewOwnerPermissions].sort(),
    );

    //************************************************************** */
    // Previous Owner Permissions

    const previousOwnerPermissionRows =
      await prisma.membershipPermission.findMany({
        where: {
          organizationId,

          membershipId: previousOwner.id,
        },
      });

    const actualPreviousOwnerPermissions = previousOwnerPermissionRows.map(
      (record) => record.permission,
    );

    const expectedPreviousOwnerPermissions = getPermissionsForRole(
      MembershipRole.ADMIN,
    );

    assert.deepEqual(
      [...actualPreviousOwnerPermissions].sort(),
      [...expectedPreviousOwnerPermissions].sort(),
    );

    assert.equal(
      newOwnerPermissionRows.every(
        (record) => record.grantedByMembershipId === ownerMembershipId,
      ),
      true,
    );

    assert.equal(
      previousOwnerPermissionRows.every(
        (record) => record.grantedByMembershipId === targetMembership.id,
      ),
      true,
    );

    //************************************************************** */
    // Audit

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,

        action: AUDIT_ACTIONS.ORGANIZATION_OWNERSHIP_TRANSFERRED,

        resourceType: AUDIT_ENTITY_TYPES.ORGANIZATION,

        resourceId: organizationId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditLog);

    const metadata = auditLog.metadata as Record<string, unknown>;

    assert.equal(metadata.previousOwnerRole, MembershipRole.OWNER);

    assert.equal(metadata.newPreviousOwnerRole, MembershipRole.ADMIN);

    assert.equal(metadata.newOwnerPreviousRole, MembershipRole.MANAGER);

    assert.equal(metadata.newOwnerRole, MembershipRole.OWNER);
  });

  //************************************************************** */

  it("rejects transferring ownership to the current owner", async () => {
    const { agent, organizationId, ownerMembershipId } =
      await createOwnershipTestOrganization();

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/transfer-ownership`)
      .send({
        membershipId: ownerMembershipId,
      });

    assert.equal(response.status, 400);

    assert.equal(response.body.code, "ORGANIZATION_OWNER_ALREADY_SELECTED");
  });

  //************************************************************** */

  it("rejects transferring ownership to a suspended membership", async () => {
    const { agent, organizationId, ownerMembershipId } =
      await createOwnershipTestOrganization();

    const { membership } = await createTransferTarget(
      organizationId,
      ownerMembershipId,
      MembershipRole.MANAGER,
      MembershipStatus.SUSPENDED,
    );

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/transfer-ownership`)
      .send({
        membershipId: membership.id,
      });

    assert.equal(response.status, 409);

    assert.equal(response.body.code, "TARGET_MEMBERSHIP_NOT_ACTIVE");
  });

  //************************************************************** */

  it("rejects transferring ownership to a removed membership", async () => {
    const { agent, organizationId, ownerMembershipId } =
      await createOwnershipTestOrganization();

    const { membership } = await createTransferTarget(
      organizationId,
      ownerMembershipId,
      MembershipRole.MANAGER,
      MembershipStatus.REMOVED,
    );

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/transfer-ownership`)
      .send({
        membershipId: membership.id,
      });

    assert.equal(response.status, 409);

    assert.equal(response.body.code, "TARGET_MEMBERSHIP_NOT_ACTIVE");
  });
});

//************************************************************** */
