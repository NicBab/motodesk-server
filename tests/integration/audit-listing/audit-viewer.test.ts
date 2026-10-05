import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Settings audit viewer integration", () => {
  const suffix = randomUUID();

  let agent: Awaited<
    ReturnType<typeof createAuthenticatedAgent>
  >["agent"];

  let organizationId: string;
  let foreignOrganizationId: string;
  let actorUserId: string;
  let restrictedMembershipId: string;

  const eventIds: string[] = [];
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  const action = `audit.viewer.${suffix}`;
  const resourceType = `AuditViewer-${suffix}`;
  const foreignAction = `audit.foreign.${suffix}`;
  const foreignResourceType = `ForeignViewer-${suffix}`;

  const from = "2026-01-10T00:00:00.000Z";
  const beforeDate = "2026-01-11T00:00:00.000Z";

  let firstEventId: string;
  let secondEventId: string;
  let foreignEventId: string;

  //************************************************************** */

  before(async () => {
    const authenticated = await createAuthenticatedAgent();

    agent = authenticated.agent;

    const ownerMembership =
      await prisma.membership.findUniqueOrThrow({
        where: {
          id: authenticated.membershipId,
        },
      });

    const organization = await prisma.organization.create({
      data: {
        name: `Audit Viewer ${suffix}`,
        slug: `audit-viewer-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerMembership.userId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const foreignOrganization = await prisma.organization.create({
      data: {
        name: `Foreign Audit Viewer ${suffix}`,
        slug: `foreign-audit-viewer-${suffix}`,
      },
    });

    foreignOrganizationId = foreignOrganization.id;
    organizationIds.push(foreignOrganizationId);

    // This organization belongs to the same authenticated user,
    // but grants no audit permission.
    const restrictedMembership = await prisma.membership.create({
      data: {
        organizationId: foreignOrganizationId,
        userId: ownerMembership.userId,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });

    restrictedMembershipId = restrictedMembership.id;

    const actor = await prisma.user.create({
      data: {
        email: `audit-viewer-${suffix}@example.com`,
        firstName: `Audit${suffix}`,
        lastName: "Viewer",
        passwordHash: `actor-password-hash-${suffix}`,
      },
    });

    actorUserId = actor.id;
    userIds.push(actorUserId);

    const first = await prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action,
        resourceType,
        resourceId: `first-${suffix}`,
        ipAddress: "192.0.2.10",
        userAgent: "MotoDesk Audit Viewer Test",
        createdAt: new Date(from),

        // Insert directly to simulate historical unsanitized data.
        metadata: {
          context: "Safe administrative context",
          password: `password-secret-${suffix}`,
          nested: {
            accessToken: `access-secret-${suffix}`,
            Authorization: `Bearer ${suffix}`,
          },
          changes: [
            {
              refreshToken: `refresh-secret-${suffix}`,
              apiKey: `api-secret-${suffix}`,
              value: "Visible change",
            },
          ],
        },
      },
    });

    firstEventId = first.id;
    eventIds.push(first.id);

    const second = await prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action,
        resourceType,
        resourceId: `second-${suffix}`,
        createdAt: new Date(from),
        metadata: {},
      },
    });

    secondEventId = second.id;
    eventIds.push(second.id);

    const boundary = await prisma.auditLog.create({
      data: {
        organizationId,
        action,
        resourceType,
        resourceId: `boundary-${suffix}`,
        createdAt: new Date(beforeDate),
        metadata: {},
      },
    });

    eventIds.push(boundary.id);

    const foreignActor = await prisma.user.create({
      data: {
        email: `foreign-audit-viewer-${suffix}@example.com`,
        firstName: "Foreign",
        lastName: suffix,
      },
    });

    userIds.push(foreignActor.id);

    const foreign = await prisma.auditLog.create({
      data: {
        organizationId: foreignOrganizationId,
        actorUserId: foreignActor.id,
        action: foreignAction,
        resourceType: foreignResourceType,
        resourceId: `foreign-${suffix}`,
        createdAt: new Date(from),
        metadata: {},
      },
    });

    foreignEventId = foreign.id;
    eventIds.push(foreign.id);

    const switched = await agent
      .post("/api/v1/auth/switch-organization")
      .send({ organizationId });

    assert.equal(switched.status, 200);
  });

  //************************************************************** */

  after(async () => {
    if (eventIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          id: { in: eventIds },
        },
      });
    }

    if (organizationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          organizationId: { in: organizationIds },
        },
      });

      await prisma.organization.deleteMany({
        where: {
          id: { in: organizationIds },
        },
      });
    }

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: { in: userIds },
        },
      });
    }
  });

  //************************************************************** */

  it("combines filters and uses inclusive start/exclusive end dates", async () => {
    const response = await agent
      .get(`/api/v1/organizations/${organizationId}/audit`)
      .query({
        action,
        resourceType,
        actorUserId,
        createdFrom: from,
        createdBefore: beforeDate,
        page: 1,
        pageSize: 100,
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.pagination.totalItems, 2);

    const ids = response.body.data.items.map(
      (event: { id: string }) => event.id,
    );

    assert.deepEqual(
      [...ids].sort(),
      [firstEventId, secondEventId].sort(),
    );

    const exact = await agent
      .get(`/api/v1/organizations/${organizationId}/audit`)
      .query({
        action,
        resourceType,
        actorUserId,
        resourceId: `first-${suffix}`,
      });

    assert.equal(exact.status, 200);
    assert.equal(exact.body.data.pagination.totalItems, 1);
    assert.equal(exact.body.data.items[0].id, firstEventId);
  });

  //************************************************************** */

  it("searches resource context, actor name/email, and IP address", async () => {
    const searches = [
      {
        search: `FIRST-${suffix.toUpperCase()}`,
        expected: 1,
      },
      {
        search: `Audit${suffix} Viewer`,
        expected: 2,
      },
      {
        search: `audit-viewer-${suffix}@example.com`,
        expected: 2,
      },
      {
        search: "192.0.2.10",
        expected: 1,
      },
    ];

    for (const { search, expected } of searches) {
      const response = await agent
        .get(`/api/v1/organizations/${organizationId}/audit`)
        .query({
          search,
          action,
          pageSize: 100,
        });

      assert.equal(response.status, 200);
      assert.equal(
        response.body.data.pagination.totalItems,
        expected,
        `Unexpected result count for ${search}`,
      );
    }
  });

  //************************************************************** */

  it("returns safe actor fields and redacts historical metadata", async () => {
    const response = await agent
      .get(`/api/v1/organizations/${organizationId}/audit`)
      .query({
        resourceId: `first-${suffix}`,
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.items.length, 1);

    const event = response.body.data.items[0];

    assert.deepEqual(event.actorUser, {
      id: actorUserId,
      firstName: `Audit${suffix}`,
      lastName: "Viewer",
      email: `audit-viewer-${suffix}@example.com`,
    });

    assert.equal(event.ipAddress, "192.0.2.10");
    assert.equal(event.userAgent, "MotoDesk Audit Viewer Test");
    assert.equal(event.metadata.context, "Safe administrative context");
    assert.equal(event.metadata.password, "[REDACTED]");
    assert.equal(event.metadata.nested.accessToken, "[REDACTED]");
    assert.equal(event.metadata.nested.Authorization, "[REDACTED]");
    assert.equal(event.metadata.changes[0].refreshToken, "[REDACTED]");
    assert.equal(event.metadata.changes[0].apiKey, "[REDACTED]");
    assert.equal(event.metadata.changes[0].value, "Visible change");

    const serialized = JSON.stringify(response.body);

    for (const secret of [
      `actor-password-hash-${suffix}`,
      `password-secret-${suffix}`,
      `access-secret-${suffix}`,
      `Bearer ${suffix}`,
      `refresh-secret-${suffix}`,
      `api-secret-${suffix}`,
    ]) {
      assert.equal(serialized.includes(secret), false);
    }
  });

  //************************************************************** */

  it("paginates tied timestamps deterministically", async () => {
    const query = {
      action,
      actorUserId,
      createdFrom: from,
      createdBefore: beforeDate,
      pageSize: 1,
    };

    const firstPage = await agent
      .get(`/api/v1/organizations/${organizationId}/audit`)
      .query({ ...query, page: 1 });

    const secondPage = await agent
      .get(`/api/v1/organizations/${organizationId}/audit`)
      .query({ ...query, page: 2 });

    const repeatedFirstPage = await agent
      .get(`/api/v1/organizations/${organizationId}/audit`)
      .query({ ...query, page: 1 });

    assert.equal(firstPage.status, 200);
    assert.equal(secondPage.status, 200);
    assert.equal(repeatedFirstPage.status, 200);

    assert.equal(firstPage.body.data.pagination.totalItems, 2);
    assert.equal(firstPage.body.data.items.length, 1);
    assert.equal(secondPage.body.data.items.length, 1);

    assert.notEqual(
      firstPage.body.data.items[0].id,
      secondPage.body.data.items[0].id,
    );

    assert.equal(
      firstPage.body.data.items[0].id,
      repeatedFirstPage.body.data.items[0].id,
    );

    assert.deepEqual(
      [
        firstPage.body.data.items[0].id,
        secondPage.body.data.items[0].id,
      ].sort(),
      [firstEventId, secondEventId].sort(),
    );
  });

  //************************************************************** */

  it("isolates search results and filter options by organization", async () => {
    const response = await agent
      .get(`/api/v1/organizations/${organizationId}/audit`)
      .query({
        search: `foreign-${suffix}`,
        pageSize: 100,
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.pagination.totalItems, 0);
    assert.deepEqual(response.body.data.items, []);

    const exact = await agent
      .get(`/api/v1/organizations/${organizationId}/audit`)
      .query({
        resourceId: `foreign-${suffix}`,
      });

    assert.equal(exact.status, 200);
    assert.equal(exact.body.data.pagination.totalItems, 0);

    const options = await agent.get(
      `/api/v1/organizations/${organizationId}/audit/filter-options`,
    );

    assert.equal(options.status, 200);
    assert.equal(options.body.success, true);

    assert.equal(options.body.data.actions.includes(action), true);
    assert.equal(
      options.body.data.resourceTypes.includes(resourceType),
      true,
    );

    assert.deepEqual(
      options.body.data.actors.find(
        (actor: { id: string }) => actor.id === actorUserId,
      ),
      {
        id: actorUserId,
        firstName: `Audit${suffix}`,
        lastName: "Viewer",
        email: `audit-viewer-${suffix}@example.com`,
      },
    );

    const serialized = JSON.stringify(options.body);

    for (const foreignValue of [
      foreignAction,
      foreignResourceType,
      foreignEventId,
      foreignOrganizationId,
      `foreign-audit-viewer-${suffix}@example.com`,
    ]) {
      assert.equal(serialized.includes(foreignValue), false);
    }
  });

  //************************************************************** */

  it("rejects invalid date ranges and malformed dates", async () => {
    const invalidQueries = [
      { createdFrom: "not-a-date" },
      { createdBefore: "2026-01-11" },
      { createdFrom: beforeDate, createdBefore: from },
      { createdFrom: from, createdBefore: from },
    ];

    for (const query of invalidQueries) {
      const response = await agent
        .get(`/api/v1/organizations/${organizationId}/audit`)
        .query(query);

      assert.equal(response.status, 400);
      assert.equal(response.body.success, false);
    }
  });

  //************************************************************** */

  it("requires authentication on both endpoints", async () => {
    for (const path of ["", "/filter-options"]) {
      const response = await request(app).get(
        `/api/v1/organizations/${organizationId}/audit${path}`,
      );

      assert.equal(response.status, 401);
    }
  });

  //************************************************************** */

  it("denies both endpoints without audit:view", async () => {
    const membership =
      await prisma.membership.findUniqueOrThrow({
        where: {
          id: restrictedMembershipId,
        },
      });

    assert.equal(membership.role, "TECHNICIAN");

    const switched = await agent
      .post("/api/v1/auth/switch-organization")
      .send({
        organizationId: foreignOrganizationId,
      });

    assert.equal(switched.status, 200);

    try {
      for (const path of ["", "/filter-options"]) {
        const response = await agent.get(
          `/api/v1/organizations/${foreignOrganizationId}/audit${path}`,
        );

        assert.equal(response.status, 403);
        assert.equal(response.body.success, false);
      }
    } finally {
      const restored = await agent
        .post("/api/v1/auth/switch-organization")
        .send({ organizationId });

      assert.equal(restored.status, 200);
    }
  });
});

//************************************************************** */