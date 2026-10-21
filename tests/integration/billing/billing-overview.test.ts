import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  Permissions,
} from "../../../src/modules/permissions/permission.constants.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

//************************************************************** */

function accessCookie(
  response: { headers: Record<string, unknown> },
): string {
  const header = response.headers["set-cookie"];

  const lines = Array.isArray(header)
    ? header.map(String)
    : typeof header === "string"
      ? [header]
      : [];

  const cookie = lines.find((line) =>
    line.startsWith("motodesk_access_token="),
  );

  assert.ok(cookie, "Expected client access cookie.");

  return cookie.split(";")[0]!;
}

//************************************************************** */

describe("Organization billing overview HTTP API", () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  const password = "MotoDeskBillingOverview123!";

  let organizationId: string;
  let otherOrganizationId: string;
  let ownerId: string;
  let memberMembershipId: string;
  let ownerCookie: string;
  let memberCookie: string;

  async function createUser(label: string) {
    const email =
      `billing-overview-${label}-${randomUUID()}@example.com`
        .toLowerCase();

    const user = await prisma.user.create({
      data: {
        email,
        firstName: "Billing",
        lastName: label,
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password });

    assert.equal(
      response.status,
      200,
      `Login failed: ${JSON.stringify(response.body)}`,
    );

    assert.equal(
      response.body.data.membership.organizationId,
      organizationId,
    );

    return accessCookie(response);
  }

  function endpoint(id = organizationId): string {
    return `/api/v1/organizations/${id}/billing`;
  }

  function getOverview(cookie = ownerCookie) {
    return request(app)
      .get(endpoint())
      .set("Cookie", cookie);
  }

  beforeEach(async () => {
    const suffix = randomUUID();

    for (const label of ["primary", "other"]) {
      const organization = await prisma.organization.create({
        data: {
          name: `Billing overview ${label} ${suffix}`,
          slug: `billing-overview-${label}-${suffix}`,
        },
      });

      organizationIds.push(organization.id);

      if (label === "primary") {
        organizationId = organization.id;
      } else {
        otherOrganizationId = organization.id;
      }
    }

    const owner = await createUser("Owner");
    const member = await createUser("Member");

    ownerId = owner.id;

    await prisma.membership.create({
      data: {
        organizationId,
        userId: owner.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: member.id,
        role: "SERVICE_ADVISOR",
        status: "ACTIVE",
      },
    });

    memberMembershipId = membership.id;

    ownerCookie = await login(owner.email);
    memberCookie = await login(member.email);
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { organizationId: { in: organizationIds } },
        ],
      },
    });

    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });

    userIds.length = 0;
    organizationIds.length = 0;
  });

  it("requires authentication", async () => {
    const response = await request(app).get(endpoint());

    assert.equal(response.status, 401);
    assert.equal(
      response.body.code,
      "AUTHENTICATION_REQUIRED",
    );
  });

  it("rejects another organization's billing endpoint", async () => {
    const response = await request(app)
      .get(endpoint(otherOrganizationId))
      .set("Cookie", ownerCookie);

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "ORGANIZATION_ACCESS_DENIED",
    );
  });

  it("requires billing view permission and observes permission removal", async () => {
    const denied = await getOverview(memberCookie);

    assert.equal(denied.status, 403);
    assert.equal(
      denied.body.code,
      "INSUFFICIENT_PERMISSIONS",
    );

    const grant = await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: memberMembershipId,
        permission: Permissions.BILLING_VIEW,
      },
    });

    assert.equal(
      (await getOverview(memberCookie)).status,
      200,
    );

    await prisma.membershipPermission.delete({
      where: { id: grant.id },
    });

    assert.equal(
      (await getOverview(memberCookie)).status,
      403,
    );
  });

  it("returns an unsubscribed overview without creating a billing record", async () => {
    const response = await getOverview();

    assert.equal(response.status, 200);

    const data = response.body.data;

    assert.equal(data.organizationId, organizationId);
    assert.equal(data.billingExempt, false);
    assert.equal(data.subscription.status, "NOT_SUBSCRIBED");
    assert.equal(data.subscription.plan, null);
    assert.equal(data.subscription.trialStartedAt, null);
    assert.equal(data.usage.assignedUsers, 2);
    assert.equal(data.checkoutPending, false);
    assert.equal(data.lastSyncedAt, null);

    assert.equal(
      await prisma.organizationBilling.count({
        where: { organizationId },
      }),
      0,
    );

    assert.match(
      String(response.headers["cache-control"]),
      /no-store/i,
    );
  });

  it("returns subscription fields without internal Stripe identifiers", async () => {
    const suffix = randomUUID();

    const customerId = `cus_test_${suffix}`;
    const subscriptionId = `sub_test_${suffix}`;
    const priceId = `price_test_${suffix}`;
    const operationId = randomUUID();

    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-01-15T00:00:00.000Z");

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        planId: "starter",
        status: "TRIALING",
        currency: "usd",
        unitAmount: 8_900,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        trialStartedAt: start,
        trialEndsAt: end,
        checkoutOperationId: operationId,
        lastSyncedAt: start,
      },
    });

    const response = await getOverview();

    assert.equal(response.status, 200);

    const data = response.body.data;

    assert.equal(data.subscription.status, "TRIALING");

    assert.deepEqual(data.subscription.plan, {
      id: "starter",
      name: "Starter",
      currency: "usd",
      interval: "month",
      unitAmount: 8_900,
      usersIncluded: 2,
    });

    assert.equal(
      data.subscription.currentPeriodStart,
      start.toISOString(),
    );

    assert.equal(
      data.subscription.trialEndsAt,
      end.toISOString(),
    );

    assert.equal(data.checkoutPending, true);

    const body = JSON.stringify(response.body);

    for (const internalId of [
      customerId,
      subscriptionId,
      priceId,
      operationId,
    ]) {
      assert.equal(body.includes(internalId), false);
    }
  });

  it("shows exemption without pretending there is a paid subscription", async () => {
    await prisma.platformAdmin.create({
      data: {
        userId: ownerId,
        role: "SUPER_ADMIN",
        billingExempt: true,
      },
    });

    const response = await getOverview();

    assert.equal(response.status, 200);
    assert.equal(response.body.data.billingExempt, true);
    assert.equal(
      response.body.data.subscription.status,
      "NOT_SUBSCRIBED",
    );

    assert.equal(
      response.body.data.subscription.plan,
      null,
    );
  });

  it("rejects an unsupported stored plan", async () => {
    await prisma.organizationBilling.create({
      data: {
        organizationId,
        planId: "unsupported-plan",
      },
    });

    const response = await getOverview();

    assert.equal(response.status, 503);
    assert.equal(
      response.body.code,
      "BILLING_PLAN_CONFIGURATION_INVALID",
    );
  });
});