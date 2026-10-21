import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

//************************************************************** */

function readClientAccessCookie(
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

  assert.ok(cookie, "Expected a client access-token cookie.");

  return cookie.split(";")[0]!;
}

//************************************************************** */

describe("Billing checkout HTTP access", () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  const password = "MotoDeskCheckoutAccess123!";

  let organizationId: string;
  let ownerId: string;
  let ownerAccessCookie: string;
  let stripeCalls: number;

  function unexpectedStripeCall(): never {
    stripeCalls += 1;
    throw new Error("Stripe must not be called for this request.");
  }

  async function createUser(label: string) {
    const email =
      `checkout-${label}-${randomUUID()}@example.com`
        .toLowerCase();

    const user = await prisma.user.create({
      data: {
        email,
        firstName: "Checkout",
        lastName: label,
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  async function loginAndSelectOrganization(
    email: string,
    targetOrganizationId: string,
  ): Promise<string> {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password });

    assert.equal(
      login.status,
      200,
      `Client login failed: ${JSON.stringify(login.body)}`,
    );

    const switched = await request(app)
      .post("/api/v1/auth/switch-organization")
      .set("Cookie", readClientAccessCookie(login))
      .send({
        organizationId: targetOrganizationId,
      });

    assert.equal(
      switched.status,
      200,
      `Organization switch failed: ${JSON.stringify(switched.body)}`,
    );

    return readClientAccessCookie(switched);
  }

  beforeEach(async () => {
    stripeCalls = 0;

    const stripe = getStripeClient();

    mock.method(
      stripe.customers,
      "create",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.customers,
      "retrieve",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.subscriptions,
      "list",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.prices,
      "list",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.checkout.sessions,
      "create",
      unexpectedStripeCall,
    );

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Checkout access ${suffix}`,
        slug: `checkout-access-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    const owner = await createUser("Owner");
    ownerId = owner.id;

    await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    await prisma.platformAdmin.create({
      data: {
        userId: ownerId,
        role: "SUPER_ADMIN",
        billingExempt: true,
      },
    });

    ownerAccessCookie = await loginAndSelectOrganization(
      owner.email,
      organizationId,
    );
  });

  afterEach(async () => {
    mock.restoreAll();

    const billingCount = await prisma.organizationBilling.count({
      where: {
        organizationId: { in: organizationIds },
      },
    });

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { organizationId: { in: organizationIds } },
        ],
      },
    });

    await prisma.organization.deleteMany({
      where: {
        id: { in: organizationIds },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    });

    userIds.length = 0;
    organizationIds.length = 0;

    assert.equal(
      stripeCalls,
      0,
      "Rejected checkout requests must not call Stripe.",
    );

    assert.equal(
      billingCount,
      0,
      "Rejected checkout requests must not create billing records.",
    );
  });

  function endpoint(id = organizationId): string {
    return `/api/v1/organizations/${id}/billing/checkout`;
  }

  it("requires authentication", async () => {
    const response = await request(app)
      .post(endpoint())
      .send({ planId: "starter" });

    assert.equal(response.status, 401);
    assert.equal(
      response.body.code,
      "AUTHENTICATION_REQUIRED",
    );
  });

  it("rejects access to another organization", async () => {
    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Other checkout organization ${suffix}`,
        slug: `other-checkout-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    const response = await request(app)
      .post(endpoint(other.id))
      .set("Cookie", ownerAccessCookie)
      .send({ planId: "starter" });

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "ORGANIZATION_ACCESS_DENIED",
    );
  });

  it("requires billing update permission", async () => {
    const member = await createUser("Member");

    await prisma.membership.create({
      data: {
        organizationId,
        userId: member.id,
        role: "SERVICE_ADVISOR",
        status: "ACTIVE",
      },
    });

    const memberAccessCookie =
      await loginAndSelectOrganization(
        member.email,
        organizationId,
      );

    const response = await request(app)
      .post(endpoint())
      .set("Cookie", memberAccessCookie)
      .send({ planId: "starter" });

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "INSUFFICIENT_PERMISSIONS",
    );
  });

  it("rechecks email verification before checkout", async () => {
    await prisma.user.update({
      where: { id: ownerId },
      data: { emailVerifiedAt: null },
    });

    const response = await request(app)
      .post(endpoint())
      .set("Cookie", ownerAccessCookie)
      .send({ planId: "starter" });

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "EMAIL_VERIFICATION_REQUIRED",
    );
  });

  it("rejects unsupported plans and client-controlled billing fields", async () => {
    const invalidBodies = [
      { planId: "enterprise" },
      { planId: "starter", price: 1 },
      {
        planId: "starter",
        successUrl: "https://example.com",
      },
      {
        planId: "starter",
        stripeCustomerId: "cus_other",
      },
      {
        planId: "starter",
        trialDays: 365,
      },
    ];

    for (const body of invalidBodies) {
      const response = await request(app)
        .post(endpoint())
        .set("Cookie", ownerAccessCookie)
        .send(body);

      assert.equal(
        response.status,
        400,
        `Expected rejection for: ${JSON.stringify(body)}`,
      );
    }
  });

  it("blocks checkout for an exempt organization before contacting Stripe", async () => {
    const response = await request(app)
      .post(endpoint())
      .set("Cookie", ownerAccessCookie)
      .send({ planId: "starter" });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "BILLING_EXEMPT");

    assert.match(
      String(response.headers["cache-control"]),
      /no-store/i,
    );
  });
});