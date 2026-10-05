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

describe("Platform administration integration", () => {
  const suffix = randomUUID();
  const password = "MotoDeskPlatformTest123!";
  const agent = request.agent(app);

  const organizationIds: string[] = [];
  const userIds: string[] = [];

  let adminUserId: string;
  let secondUserId: string;
  let organizationId: string;
  let secondOrganizationId: string;
  let passwordHash: string;

  const from = "2020-01-10";
  const beforeDate = "2020-01-13";

  const firstDate = new Date(`${from}T12:00:00.000Z`);
  const lastDate = new Date("2020-01-12T12:00:00.000Z");

  const paths = () => [
    "/me",
    "/overview",
    "/growth",
    "/organizations",
    `/organizations/${organizationId}`,
    `/organizations/${organizationId}/memberships`,
    "/users",
    `/users/${adminUserId}`,
    `/users/${adminUserId}/memberships`,
  ];

  //************************************************************** */

  before(async () => {
    passwordHash = await hashPassword(password);

    const admin = await prisma.user.create({
      data: {
        email: `platform-admin-${suffix}@example.com`,
        passwordHash,
        firstName: "Platform",
        lastName: suffix,
        emailVerifiedAt: new Date(),
        createdAt: firstDate,
      },
    });

    adminUserId = admin.id;
    userIds.push(admin.id);

    const secondUser = await prisma.user.create({
      data: {
        email: `platform-disabled-${suffix}@example.com`,
        firstName: "Disabled",
        lastName: suffix,
        isActive: false,
        createdAt: lastDate,
      },
    });

    secondUserId = secondUser.id;
    userIds.push(secondUser.id);

    const organization = await prisma.organization.create({
      data: {
        name: `Platform Active ${suffix}`,
        slug: `platform-active-${suffix}`,
        createdAt: firstDate,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organization.id);

    const secondOrganization = await prisma.organization.create({
      data: {
        name: `Platform Archived ${suffix}`,
        slug: `platform-archived-${suffix}`,
        status: "ARCHIVED",
        createdAt: lastDate,
      },
    });

    secondOrganizationId = secondOrganization.id;
    organizationIds.push(secondOrganization.id);

    await prisma.membership.createMany({
      data: [
        {
          userId: adminUserId,
          organizationId,
          role: "OWNER",
          status: "ACTIVE",
        },
        {
          userId: secondUserId,
          organizationId,
          role: "TECHNICIAN",
          status: "SUSPENDED",
        },
        {
          userId: secondUserId,
          organizationId: secondOrganizationId,
          role: "ADMIN",
          status: "ACTIVE",
        },
      ],
    });

    await prisma.platformAdmin.create({
      data: {
        userId: adminUserId,
        role: "SUPER_ADMIN",
      },
    });

    const login = await agent.post("/api/v1/auth/login").send({
      email: admin.email,
      password,
    });

    assert.equal(login.status, 200);

    const switched = await agent
      .post("/api/v1/auth/switch-organization")
      .send({ organizationId });

    assert.equal(switched.status, 200);
  });

  //************************************************************** */

  after(async () => {
    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { actorUserId: { in: userIds } },
      });
    }

    if (organizationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });

      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });

  //************************************************************** */

  it("requires authentication on every platform endpoint", async () => {
    for (const path of paths()) {
      const response = await request(app).get(
        `/api/v1/platform${path}`,
      );

      assert.equal(response.status, 401, path);
    }
  });

  //************************************************************** */

  it("denies organization owners without a platform grant", async () => {
    await prisma.platformAdmin.delete({
      where: { userId: adminUserId },
    });

    try {
      for (const path of paths()) {
        const response = await agent.get(`/api/v1/platform${path}`);

        assert.equal(response.status, 403, path);
        assert.equal(response.body.success, false);
      }
    } finally {
      await prisma.platformAdmin.create({
        data: {
          userId: adminUserId,
          role: "SUPER_ADMIN",
        },
      });
    }
  });

  //************************************************************** */

  it("returns the platform identity and supports the ADMIN role", async () => {
    await prisma.platformAdmin.update({
      where: { userId: adminUserId },
      data: { role: "ADMIN" },
    });

    try {
      const response = await agent.get("/api/v1/platform/me");

      assert.equal(response.status, 200);
      assert.equal(response.body.data.user.id, adminUserId);
      assert.equal(response.body.data.platformAdmin.role, "ADMIN");

      const overview = await agent.get("/api/v1/platform/overview");

      assert.equal(overview.status, 200);
    } finally {
      await prisma.platformAdmin.update({
        where: { userId: adminUserId },
        data: { role: "SUPER_ADMIN" },
      });
    }
  });

  //************************************************************** */

  it("applies grant revocation immediately to an existing session", async () => {
    const allowed = await agent.get("/api/v1/platform/me");
    assert.equal(allowed.status, 200);

    await prisma.platformAdmin.update({
      where: { userId: adminUserId },
      data: { isActive: false },
    });

    try {
      for (const path of paths()) {
        const response = await agent.get(`/api/v1/platform${path}`);

        assert.equal(response.status, 403, path);
      }
    } finally {
      await prisma.platformAdmin.update({
        where: { userId: adminUserId },
        data: { isActive: true },
      });
    }

    const restored = await agent.get("/api/v1/platform/me");
    assert.equal(restored.status, 200);
  });

  //************************************************************** */

  it("requires verified email and an enabled account", async () => {
    await prisma.user.update({
      where: { id: adminUserId },
      data: { emailVerifiedAt: null },
    });

    try {
      const response = await agent.get("/api/v1/platform/me");

      assert.equal(response.status, 403);
    } finally {
      await prisma.user.update({
        where: { id: adminUserId },
        data: { emailVerifiedAt: new Date() },
      });
    }

    await prisma.user.update({
      where: { id: adminUserId },
      data: { isActive: false },
    });

    try {
      const response = await agent.get("/api/v1/platform/me");

      assert.equal(response.status, 401);
    } finally {
      await prisma.user.update({
        where: { id: adminUserId },
        data: { isActive: true },
      });
    }
  });

  //************************************************************** */

  it("lists organizations across tenants with filtering and pagination", async () => {
    const first = await agent
      .get("/api/v1/platform/organizations")
      .query({ search: suffix, page: 1, pageSize: 1 });

    const second = await agent
      .get("/api/v1/platform/organizations")
      .query({ search: suffix, page: 2, pageSize: 1 });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.data.pagination.totalItems, 2);
    assert.equal(first.body.data.items.length, 1);
    assert.equal(second.body.data.items.length, 1);

    const ids = [
      first.body.data.items[0].id,
      second.body.data.items[0].id,
    ];

    assert.deepEqual(
      ids.sort(),
      [organizationId, secondOrganizationId].sort(),
    );

    const archived = await agent
      .get("/api/v1/platform/organizations")
      .query({ search: suffix, status: "ARCHIVED" });

    assert.equal(archived.status, 200);
    assert.equal(archived.body.data.pagination.totalItems, 1);
    assert.equal(
      archived.body.data.items[0].id,
      secondOrganizationId,
    );

    assert.equal(
      archived.body.data.items[0].subscription.status,
      "NOT_CONFIGURED",
    );

    const detail = await agent.get(
      `/api/v1/platform/organizations/${organizationId}`,
    );

    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.activeMembershipCount, 1);
    assert.equal(detail.body.data.recordCounts.vehicles, 0);
  });

  //************************************************************** */

  it("filters users and excludes credentials from directory responses", async () => {
    const response = await agent
      .get("/api/v1/platform/users")
      .query({ search: suffix, isActive: "false" });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.pagination.totalItems, 1);
    assert.equal(response.body.data.items[0].id, secondUserId);
    assert.equal(response.body.data.items[0].isActive, false);

    const detail = await agent.get(
      `/api/v1/platform/users/${adminUserId}`,
    );

    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.activeMembershipCount, 1);
    assert.equal("passwordHash" in detail.body.data, false);

    const all = await agent
      .get("/api/v1/platform/users")
      .query({ search: suffix });

    assert.equal(all.status, 200);
    assert.equal(all.body.data.pagination.totalItems, 2);

    const serialized = JSON.stringify(all.body);

    assert.equal(serialized.includes(passwordHash), false);
    assert.equal(serialized.includes('"passwordHash"'), false);
    assert.equal(serialized.includes('"sessions"'), false);
    assert.equal(serialized.includes('"authTokens"'), false);
  });

  //************************************************************** */

  it("paginates membership details across organizations safely", async () => {
    const organizationMembers = await agent
      .get(
        `/api/v1/platform/organizations/${organizationId}/memberships`,
      )
      .query({ pageSize: 1 });

    assert.equal(organizationMembers.status, 200);
    assert.equal(
      organizationMembers.body.data.pagination.totalItems,
      2,
    );
    assert.equal(organizationMembers.body.data.items.length, 1);

    const userMemberships = await agent.get(
      `/api/v1/platform/users/${secondUserId}/memberships`,
    );

    assert.equal(userMemberships.status, 200);
    assert.equal(userMemberships.body.data.pagination.totalItems, 2);

    const serialized = JSON.stringify(userMemberships.body);

    assert.equal(serialized.includes('"passwordHash"'), false);
    assert.equal(serialized.includes('"tokenHash"'), false);
  });

  //************************************************************** */

  it("returns accurate overview counts and unavailable billing metrics", async () => {
    const response = await agent
      .get("/api/v1/platform/overview")
      .query({ from, before: beforeDate });

    assert.equal(response.status, 200);

    const data = response.body.data;

    assert.equal(
      data.organizations.total,
      await prisma.organization.count(),
    );

    assert.equal(
      data.users.total,
      await prisma.user.count(),
    );

    assert.equal(
      data.users.enabled,
      await prisma.user.count({ where: { isActive: true } }),
    );

    assert.equal(
      data.memberships.active,
      await prisma.membership.count({
        where: { status: "ACTIVE" },
      }),
    );

    assert.equal(data.range.timezone, "UTC");
    assert.equal(data.billing.status, "NOT_CONFIGURED");
    assert.equal(data.billing.activeSubscriptions, null);
    assert.equal(data.billing.monthlyRecurringRevenue, null);
    assert.equal(data.billing.collectedPayments, null);
  });

  //************************************************************** */

  it("fills daily growth points and calculates cumulative retained registrations", async () => {
    const response = await agent
      .get("/api/v1/platform/growth")
      .query({ from, before: beforeDate });

    assert.equal(response.status, 200);

    const points = response.body.data.points;

    assert.deepEqual(
      points.map((point: { date: string }) => point.date),
      ["2020-01-10", "2020-01-11", "2020-01-12"],
    );

    assert.equal(
      response.body.data.basis,
      "RETAINED_REGISTRATIONS",
    );

    for (const point of points) {
      const start = new Date(`${point.date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);

      assert.equal(
        point.newOrganizations,
        await prisma.organization.count({
          where: { createdAt: { gte: start, lt: end } },
        }),
      );

      assert.equal(
        point.newUsers,
        await prisma.user.count({
          where: { createdAt: { gte: start, lt: end } },
        }),
      );

      assert.equal(
        point.cumulativeOrganizations,
        await prisma.organization.count({
          where: { createdAt: { lt: end } },
        }),
      );

      assert.equal(
        point.cumulativeUsers,
        await prisma.user.count({
          where: { createdAt: { lt: end } },
        }),
      );
    }
  });

  //************************************************************** */

  it("rejects invalid queries and returns 404 for unknown resources", async () => {
    for (const query of [
      { from: "invalid" },
      { from: "2020-01-10", before: "2020-01-10" },
      { from: "2020-01-12", before: "2020-01-10" },
      { from: "2020-01-01", before: "2022-01-01" },
    ]) {
      const response = await agent
        .get("/api/v1/platform/growth")
        .query(query);

      assert.equal(response.status, 400);
    }

    const invalidBoolean = await agent
      .get("/api/v1/platform/users")
      .query({ isActive: "invalid" });

    assert.equal(invalidBoolean.status, 400);

    const invalidPage = await agent
      .get("/api/v1/platform/organizations")
      .query({ page: 0 });

    assert.equal(invalidPage.status, 400);

    for (const path of [
      `/organizations/missing-${suffix}`,
      `/organizations/missing-${suffix}/memberships`,
      `/users/missing-${suffix}`,
      `/users/missing-${suffix}/memberships`,
    ]) {
      const response = await agent.get(`/api/v1/platform${path}`);

      assert.equal(response.status, 404, path);
    }
  });
});

//************************************************************** */