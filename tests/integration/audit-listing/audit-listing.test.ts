import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../src/modules/audit/audit.constants.js";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Organization audit listing integration", () => {
  it("lists organization audit logs with pagination", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    await prisma.auditLog.createMany({
      data: [
        {
          organizationId,
          action: AUDIT_ACTIONS.MEMBERSHIP_CREATED,
          resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
          resourceId: `audit-pagination-1-${Date.now()}`,
          metadata: {},
        },
        {
          organizationId,
          action: AUDIT_ACTIONS.MEMBERSHIP_UPDATED,
          resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
          resourceId: `audit-pagination-2-${Date.now()}`,
          metadata: {},
        },
        {
          organizationId,
          action: AUDIT_ACTIONS.INVITATION_CREATED,
          resourceType: AUDIT_ENTITY_TYPES.INVITATION,
          resourceId: `audit-pagination-3-${Date.now()}`,
          metadata: {},
        },
      ],
    });

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/audit?page=1&pageSize=2`,
    );

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    assert.equal(response.body.data.items.length, 2);

    assert.equal(response.body.data.pagination.page, 1);

    assert.equal(response.body.data.pagination.pageSize, 2);

    assert.equal(response.body.data.pagination.totalItems >= 3, true);
  });

  //************************************************************** */

  it("returns audit logs scoped to the requested organization", async () => {
    const first = await createAuthenticatedAgent();

    const ownerMembership = await prisma.membership.findUniqueOrThrow({
      where: {
        id: first.membershipId,
      },
    });

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

    const secondOrganization = await prisma.organization.create({
      data: {
        name: `Audit Scope ${suffix}`,
        slug: `audit-scope-${suffix}`,
      },
    });

    await prisma.membership.create({
      data: {
        organizationId: secondOrganization.id,
        userId: ownerMembership.userId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const firstResourceId = `first-org-resource-${suffix}`;

    const secondResourceId = `second-org-resource-${suffix}`;

    await prisma.auditLog.create({
      data: {
        organizationId: first.organizationId,
        action: AUDIT_ACTIONS.MEMBERSHIP_CREATED,
        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
        resourceId: firstResourceId,
        metadata: {},
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: secondOrganization.id,
        action: AUDIT_ACTIONS.MEMBERSHIP_CREATED,
        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
        resourceId: secondResourceId,
        metadata: {},
      },
    });

    const response = await first.agent.get(
      `/api/v1/organizations/${first.organizationId}/audit?page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);

    const resourceIds = response.body.data.items.map(
      (auditLog: { resourceId: string | null }) => auditLog.resourceId,
    );

    assert.equal(resourceIds.includes(firstResourceId), true);

    assert.equal(resourceIds.includes(secondResourceId), false);
  });

  //************************************************************** */

  it("orders audit logs by newest first", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

    const firstResourceId = `audit-order-first-${suffix}`;

    const secondResourceId = `audit-order-second-${suffix}`;

    await prisma.auditLog.create({
      data: {
        organizationId,
        action: AUDIT_ACTIONS.MEMBERSHIP_UPDATED,
        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
        resourceId: firstResourceId,
        metadata: {},
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    await prisma.auditLog.create({
      data: {
        organizationId,
        action: AUDIT_ACTIONS.MEMBERSHIP_UPDATED,
        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
        resourceId: secondResourceId,
        metadata: {},
      },
    });

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/audit?page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);

    const items = response.body.data.items;

    const firstIndex = items.findIndex(
      (auditLog: { resourceId: string | null }) =>
        auditLog.resourceId === firstResourceId,
    );

    const secondIndex = items.findIndex(
      (auditLog: { resourceId: string | null }) =>
        auditLog.resourceId === secondResourceId,
    );

    assert.equal(firstIndex >= 0, true);

    assert.equal(secondIndex >= 0, true);

    assert.equal(secondIndex < firstIndex, true);
  });

  //************************************************************** */

  it("filters audit logs by action and resource type", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

    const matchingResourceId = `audit-filter-match-${suffix}`;

    const otherResourceId = `audit-filter-other-${suffix}`;

    await prisma.auditLog.create({
      data: {
        organizationId,
        action: AUDIT_ACTIONS.INVITATION_CREATED,
        resourceType: AUDIT_ENTITY_TYPES.INVITATION,
        resourceId: matchingResourceId,
        metadata: {},
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        action: AUDIT_ACTIONS.MEMBERSHIP_CREATED,
        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
        resourceId: otherResourceId,
        metadata: {},
      },
    });

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/audit?action=${encodeURIComponent(
        AUDIT_ACTIONS.INVITATION_CREATED,
      )}&resourceType=${encodeURIComponent(
        AUDIT_ENTITY_TYPES.INVITATION,
      )}&page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);

    const items = response.body.data.items;

    assert.equal(
      items.some(
        (auditLog: { resourceId: string | null }) =>
          auditLog.resourceId === matchingResourceId,
      ),
      true,
    );

    assert.equal(
      items.some(
        (auditLog: { resourceId: string | null }) =>
          auditLog.resourceId === otherResourceId,
      ),
      false,
    );
  });

  //************************************************************** */

  it("filters audit logs by resource id and actor user id", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const ownerMembership = await prisma.membership.findFirstOrThrow({
      where: {
        organizationId,
        role: "OWNER",
      },
    });

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

    const targetResourceId = `audit-resource-filter-${suffix}`;

    const otherResourceId = `audit-resource-other-${suffix}`;

    await prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId: ownerMembership.userId,
        action: AUDIT_ACTIONS.MEMBERSHIP_UPDATED,
        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
        resourceId: targetResourceId,
        metadata: {},
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        action: AUDIT_ACTIONS.MEMBERSHIP_UPDATED,
        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,
        resourceId: otherResourceId,
        metadata: {},
      },
    });

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/audit?resourceId=${encodeURIComponent(
        targetResourceId,
      )}&actorUserId=${encodeURIComponent(
        ownerMembership.userId,
      )}&page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);

    assert.equal(response.body.data.items.length, 1);

    assert.equal(response.body.data.items[0].resourceId, targetResourceId);

    assert.equal(
      response.body.data.items[0].actorUserId,
      ownerMembership.userId,
    );
  });
});

//************************************************************** */
