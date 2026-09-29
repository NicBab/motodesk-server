import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { OrganizationStatus } from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../src/modules/audit/audit.constants.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

function createSafeSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

//************************************************************** */

async function createArchiveTestOrganization() {
  const { agent } = await createAuthenticatedAgent();

  const suffix = createSafeSuffix();

  const createResponse = await agent.post("/api/v1/organizations").send({
    name: `Archive Test ${suffix}`,

    slug: `archive-test-${suffix}`,
  });

  assert.equal(createResponse.status, 201);

  const organizationId = createResponse.body.data.id;

  const switchResponse = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  assert.equal(switchResponse.status, 200);

  //************************************************************** */
  // Resolve the owner and the authenticated session used by this
  // agent so recent-authentication state can be controlled directly.

  const ownerMembership = await prisma.membership.findFirstOrThrow({
    where: {
      organizationId,

      role: "OWNER",
    },
  });

  const session = await prisma.session.findFirstOrThrow({
    where: {
      userId: ownerMembership.userId,

      revokedAt: null,
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  return {
    agent,

    organizationId,

    sessionId: session.id,
  };
}

//************************************************************** */

describe("Organization archive integration", () => {
  it("archives an active organization and records the audit event", async () => {
    const { agent, organizationId } = await createArchiveTestOrganization();

    const response = await agent.delete(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    assert.equal(response.body.data.status, OrganizationStatus.ARCHIVED);

    const organization = await prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
    });

    assert.ok(organization);

    assert.equal(organization.status, OrganizationStatus.ARCHIVED);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,

        action: AUDIT_ACTIONS.ORGANIZATION_ARCHIVED,

        resourceType: AUDIT_ENTITY_TYPES.ORGANIZATION,

        resourceId: organizationId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditLog);
  });

  //************************************************************** */

  it("requires recent authentication before archiving an organization", async () => {
    const { agent, organizationId, sessionId } =
      await createArchiveTestOrganization();

    //************************************************************** */
    // Keep the session itself valid while making its most recent
    // credential authentication intentionally stale.

    await prisma.session.update({
      where: {
        id: sessionId,
      },

      data: {
        lastAuthenticatedAt: new Date("2000-01-01T00:00:00.000Z"),
      },
    });

    const response = await agent.delete(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(response.status, 403);

    assert.equal(response.body?.success, false);

    assert.equal(response.body?.code, "RECENT_AUTHENTICATION_REQUIRED");

    //************************************************************** */
    // The rejected request must not have archived the organization.

    const organization = await prisma.organization.findUniqueOrThrow({
      where: {
        id: organizationId,
      },
    });

    assert.equal(organization.status, OrganizationStatus.ACTIVE);

    //************************************************************** */
    // A rejected archive must not produce an archive audit event.

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,

        action: AUDIT_ACTIONS.ORGANIZATION_ARCHIVED,

        resourceType: AUDIT_ENTITY_TYPES.ORGANIZATION,

        resourceId: organizationId,
      },
    });

    assert.equal(auditLog, null);
  });

  //************************************************************** */

  it("removes an archived organization from the current user organization list", async () => {
    const { agent, organizationId } = await createArchiveTestOrganization();

    const beforeResponse = await agent.get("/api/v1/organizations/me");

    assert.equal(beforeResponse.status, 200);

    assert.equal(
      beforeResponse.body.data.some(
        (membership: {
          organization: {
            id: string;
          };
        }) => membership.organization.id === organizationId,
      ),
      true,
    );

    const archiveResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(archiveResponse.status, 200);

    const afterResponse = await agent.get("/api/v1/organizations/me");

    assert.equal(afterResponse.status, 200);

    assert.equal(
      afterResponse.body.data.some(
        (membership: {
          organization: {
            id: string;
          };
        }) => membership.organization.id === organizationId,
      ),
      false,
    );
  });

  //************************************************************** */

  it("rejects updating an archived organization", async () => {
    const { agent, organizationId } = await createArchiveTestOrganization();

    const archiveResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(archiveResponse.status, 200);

    const updateResponse = await agent
      .patch(`/api/v1/organizations/${organizationId}`)
      .send({
        name: "Archived Organization Updated",
      });

    assert.equal(updateResponse.status, 403);

    assert.equal(updateResponse.body.code, "ORGANIZATION_MEMBERSHIP_REQUIRED");
  });

  //************************************************************** */

  it("rejects a second archive attempt", async () => {
    const { agent, organizationId } = await createArchiveTestOrganization();

    const firstResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(firstResponse.status, 200);

    const secondResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(secondResponse.status, 403);

    assert.equal(secondResponse.body.code, "ORGANIZATION_MEMBERSHIP_REQUIRED");
  });

  //************************************************************** */

  it("rejects organization scoped access after the organization is archived", async () => {
    const { agent, organizationId } = await createArchiveTestOrganization();

    const beforeResponse = await agent.get(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(beforeResponse.status, 200);

    const archiveResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(archiveResponse.status, 200);

    const afterResponse = await agent.get(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(afterResponse.status, 403);

    assert.equal(afterResponse.body.code, "ORGANIZATION_MEMBERSHIP_REQUIRED");
  });
});

//************************************************************** */
