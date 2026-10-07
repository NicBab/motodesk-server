import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

//************************************************************** */

describe("Platform audit integration", () => {
  const suffix = randomUUID();
  const agent = request.agent(app);

  const organizationIds: string[] = [];
  const eventIds: string[] = [];

  let userId: string;
  let organizationAId: string;
  let organizationBId: string;

  let eventAId: string;
  let eventBId: string;
  let unassignedEventId: string;

  const action = `platform.audit.test.${suffix}`;
  const resourceType = `PlatformAuditTest-${suffix}`;

  const createdFrom = "2020-02-01T00:00:00.000Z";
  const createdBefore = "2020-02-02T00:00:00.000Z";

  //************************************************************** */

  before(async () => {
    const password = "MotoDeskAuditAdmin123!";

    const user = await prisma.user.create({
      data: {
        email: `platform-audit-${suffix}@example.com`,
        firstName: "PlatformAudit",
        lastName: suffix,
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
      },
    });

    userId = user.id;

    const organizationA = await prisma.organization.create({
      data: {
        name: `Audit A ${suffix}`,
        slug: `audit-a-${suffix}`,
      },
    });

    organizationAId = organizationA.id;
    organizationIds.push(organizationA.id);

    const organizationB = await prisma.organization.create({
      data: {
        name: `Audit B ${suffix}`,
        slug: `audit-b-${suffix}`,
      },
    });

    organizationBId = organizationB.id;
    organizationIds.push(organizationB.id);

    // The actor has organization access only to A.
    await prisma.membership.create({
      data: {
        userId,
        organizationId: organizationAId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    await prisma.platformAdmin.create({
      data: {
        userId,
        role: "ADMIN",
      },
    });

    const eventA = await prisma.auditLog.create({
      data: {
        organizationId: organizationAId,
        actorUserId: userId,
        action,
        resourceType,
        resourceId: `resource-a-${suffix}`,
        ipAddress: "192.0.2.20",
        createdAt: new Date(createdFrom),

        // Simulate historical metadata that bypassed write redaction.
        metadata: {
          context: "Safe context",
          password: `password-secret-${suffix}`,
          nested: {
            refreshToken: `refresh-secret-${suffix}`,
            apiKey: `api-secret-${suffix}`,
          },
        },
      },
    });

    eventAId = eventA.id;
    eventIds.push(eventA.id);

    const eventB = await prisma.auditLog.create({
      data: {
        organizationId: organizationBId,
        actorUserId: userId,
        action,
        resourceType,
        resourceId: `resource-b-${suffix}`,
        createdAt: new Date(createdFrom),
        metadata: {},
      },
    });

    eventBId = eventB.id;
    eventIds.push(eventB.id);

    const unassigned = await prisma.auditLog.create({
      data: {
        action,
        resourceType,
        resourceId: `resource-unassigned-${suffix}`,
        createdAt: new Date(createdFrom),
        metadata: {
          source: "BOOTSTRAP_CLI",
        },
      },
    });

    unassignedEventId = unassigned.id;
    eventIds.push(unassigned.id);

    const boundary = await prisma.auditLog.create({
      data: {
        organizationId: organizationAId,
        action,
        resourceType,
        resourceId: `resource-boundary-${suffix}`,
        createdAt: new Date(createdBefore),
        metadata: {},
      },
    });

    eventIds.push(boundary.id);

    const login = await agent
      .post("/api/v1/platform/auth/login")
      .send({
        email: user.email,
        password,
      });

    assert.equal(
      login.status,
      200,
      `Admin login failed: ${JSON.stringify(login.body)}`,
    );

    assert.equal(login.body.data.membership, null);
  });

  //************************************************************** */

  after(async () => {
    if (eventIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { id: { in: eventIds } },
      });
    }

    if (organizationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          organizationId: { in: organizationIds },
        },
      });

      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }

    if (userId) {
      await prisma.auditLog.deleteMany({
        where: { actorUserId: userId },
      });

      await prisma.user.delete({
        where: { id: userId },
      });
    }
  });

  //************************************************************** */

  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/platform/audit");

    assert.equal(response.status, 401);
  });

  //************************************************************** */

  it("denies organization owners when the platform grant is inactive", async () => {
    await prisma.platformAdmin.update({
      where: { userId },
      data: { isActive: false },
    });

    try {
      const response = await agent.get("/api/v1/platform/audit");

      assert.equal(response.status, 403);
    } finally {
      await prisma.platformAdmin.update({
        where: { userId },
        data: { isActive: true },
      });
    }
  });

  //************************************************************** */

  it("lists cross-organization and unassigned events for a platform admin", async () => {
    const response = await agent
      .get("/api/v1/platform/audit")
      .query({
        action,
        createdFrom,
        createdBefore,
        pageSize: 100,
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.pagination.totalItems, 3);

    const items = response.body.data.items;

    assert.deepEqual(
      items.map((event: { id: string }) => event.id).sort(),
      [eventAId, eventBId, unassignedEventId].sort(),
    );

    const eventB = items.find(
      (event: { id: string }) => event.id === eventBId,
    );

    assert.equal(eventB.organization.id, organizationBId);

    const unassigned = items.find(
      (event: { id: string }) => event.id === unassignedEventId,
    );

    assert.equal(unassigned.organizationId, null);
    assert.equal(unassigned.organization, null);
    assert.equal(unassigned.actorUser, null);
  });

  //************************************************************** */

  it("filters organization and unassigned scopes", async () => {
    const organizations = await agent
      .get("/api/v1/platform/audit")
      .query({
        action,
        scope: "ORGANIZATION",
        createdFrom,
        createdBefore,
      });

    assert.equal(organizations.status, 200);
    assert.equal(organizations.body.data.pagination.totalItems, 2);

    const unassigned = await agent
      .get("/api/v1/platform/audit")
      .query({
        action,
        scope: "UNASSIGNED",
        createdFrom,
        createdBefore,
      });

    assert.equal(unassigned.status, 200);
    assert.equal(unassigned.body.data.pagination.totalItems, 1);
    assert.equal(unassigned.body.data.items[0].id, unassignedEventId);

    const exact = await agent
      .get("/api/v1/platform/audit")
      .query({
        action,
        organizationId: organizationBId,
        actorUserId: userId,
        resourceType,
        resourceId: `resource-b-${suffix}`,
      });

    assert.equal(exact.status, 200);
    assert.equal(exact.body.data.pagination.totalItems, 1);
    assert.equal(exact.body.data.items[0].id, eventBId);
  });

  //************************************************************** */

  it("searches display fields and excludes metadata from search", async () => {
    for (const search of [
      `resource-b-${suffix}`,
      `Audit B ${suffix}`,
    ]) {
      const response = await agent
        .get("/api/v1/platform/audit")
        .query({ action, search });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.pagination.totalItems, 1);
      assert.equal(response.body.data.items[0].id, eventBId);
    }

    const actorSearch = await agent
      .get("/api/v1/platform/audit")
      .query({
        action,
        search: `PlatformAudit ${suffix}`,
      });

    assert.equal(actorSearch.status, 200);
    assert.equal(actorSearch.body.data.pagination.totalItems, 2);

    const metadataSearch = await agent
      .get("/api/v1/platform/audit")
      .query({
        action,
        search: `password-secret-${suffix}`,
      });

    assert.equal(metadataSearch.status, 200);
    assert.equal(metadataSearch.body.data.pagination.totalItems, 0);
  });

  //************************************************************** */

  it("redacts historical metadata and selects safe actor fields", async () => {
    const response = await agent
      .get("/api/v1/platform/audit")
      .query({
        action,
        resourceId: `resource-a-${suffix}`,
      });

    assert.equal(response.status, 200);

    const event = response.body.data.items[0];

    assert.deepEqual(event.actorUser, {
      id: userId,
      firstName: "PlatformAudit",
      lastName: suffix,
      email: `platform-audit-${suffix}@example.com`,
    });

    assert.equal(event.ipAddress, "192.0.2.20");
    assert.equal(event.metadata.context, "Safe context");
    assert.equal(event.metadata.password, "[REDACTED]");
    assert.equal(event.metadata.nested.refreshToken, "[REDACTED]");
    assert.equal(event.metadata.nested.apiKey, "[REDACTED]");

    const serialized = JSON.stringify(response.body);

    for (const secret of [
      `password-secret-${suffix}`,
      `refresh-secret-${suffix}`,
      `api-secret-${suffix}`,
      '"passwordHash"',
      '"sessions"',
    ]) {
      assert.equal(serialized.includes(secret), false);
    }
  });

  //************************************************************** */

  it("paginates tied timestamps deterministically", async () => {
    const query = {
      action,
      createdFrom,
      createdBefore,
      pageSize: 1,
    };

    const ids: string[] = [];

    for (const page of [1, 2, 3]) {
      const response = await agent
        .get("/api/v1/platform/audit")
        .query({ ...query, page });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.pagination.totalItems, 3);
      assert.equal(response.body.data.items.length, 1);

      ids.push(response.body.data.items[0].id);
    }

    assert.equal(new Set(ids).size, 3);

    const repeated = await agent
      .get("/api/v1/platform/audit")
      .query({ ...query, page: 1 });

    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.data.items[0].id, ids[0]);
  });

  //************************************************************** */

   it("preserves the organization audit endpoint's tenant isolation", async () => {
    const clientAgent = request.agent(app);

    const login = await clientAgent
      .post("/api/v1/auth/login")
      .send({
        email: `platform-audit-${suffix}@example.com`,
        password: "MotoDeskAuditAdmin123!",
      });

    assert.equal(
      login.status,
      200,
      `Client login failed: ${JSON.stringify(login.body)}`,
    );

    const switched = await clientAgent
      .post("/api/v1/auth/switch-organization")
      .send({
        organizationId: organizationAId,
      });

    assert.equal(switched.status, 200);

    const response = await clientAgent
      .get(`/api/v1/organizations/${organizationAId}/audit`)
      .query({ action, pageSize: 100 });

    assert.equal(response.status, 200);

    const ids = response.body.data.items.map(
      (event: { id: string }) => event.id,
    );

    assert.ok(ids.includes(eventAId));
    assert.equal(ids.includes(eventBId), false);
    assert.equal(ids.includes(unassignedEventId), false);
  });

  //************************************************************** */

  it("rejects incompatible scopes, invalid dates, and invalid pagination", async () => {
    for (const query of [
      {
        scope: "UNASSIGNED",
        organizationId: organizationAId,
      },
      { scope: "INVALID" },
      { createdFrom: "not-a-date" },
      { createdFrom: createdBefore, createdBefore: createdFrom },
      { page: 0 },
      { pageSize: 101 },
    ]) {
      const response = await agent
        .get("/api/v1/platform/audit")
        .query(query);

      assert.equal(response.status, 400);
    }
  });
});

//************************************************************** */