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

import type Stripe from "stripe";

import { app } from "../../../src/app.js";
import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

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

describe("Organization billing portal HTTP API", () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  const password = "MotoDeskBillingPortal123!";

  let organizationId: string;
  let ownerId: string;
  let ownerCookie: string;
  let customerId: string;

  let customerReads: number;
  let mappedOrganizationId: string;

  let portalRequests: Stripe.BillingPortal.SessionCreateParams[];

  async function createUser(label: string) {
    const email =
      `billing-portal-${label}-${randomUUID()}@example.com`
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
    return `/api/v1/organizations/${id}/billing/portal`;
  }

  function openPortal(cookie = ownerCookie) {
    return request(app)
      .post(endpoint())
      .set("Cookie", cookie)
      .send({});
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");

    customerReads = 0;
    portalRequests = [];

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Billing portal ${suffix}`,
        slug: `billing-portal-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    customerId = `cus_test_${suffix}`;
    mappedOrganizationId = organizationId;

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

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
      },
    });

    ownerCookie = await login(owner.email);

    const stripe = getStripeClient();

    mock.method(
      stripe.customers,
      "retrieve",
      async (requestedCustomerId: string) => {
        customerReads += 1;
        assert.equal(requestedCustomerId, customerId);

        return {
          id: customerId,
          object: "customer",
          livemode: false,

          metadata: {
            organizationId: mappedOrganizationId,
          },
        };
      },
    );

    mock.method(
      stripe.billingPortal.sessions,
      "create",
      async (input: Stripe.BillingPortal.SessionCreateParams) => {
        portalRequests.push(input);

        return {
          id: `bps_test_${randomUUID()}`,
          object: "billing_portal.session",
          customer: customerId,
          livemode: false,
          url: "https://billing.stripe.com/p/session/test-motodesk",
        };
      },
    );

    mock.method(
      stripe.customers,
      "create",
      () => {
        throw new Error(
          "Opening the portal must not create customers.",
        );
      },
    );
  });

  afterEach(async () => {
    mock.restoreAll();

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

  it("requires authentication before contacting Stripe", async () => {
    const response = await request(app)
      .post(endpoint())
      .send({});

    assert.equal(response.status, 401);
    assert.equal(customerReads, 0);
    assert.equal(portalRequests.length, 0);
  });

  it("rejects another organization's portal", async () => {
    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Other portal ${suffix}`,
        slug: `other-portal-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    const response = await request(app)
      .post(endpoint(other.id))
      .set("Cookie", ownerCookie)
      .send({});

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "ORGANIZATION_ACCESS_DENIED",
    );

    assert.equal(customerReads, 0);
    assert.equal(portalRequests.length, 0);
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

    const memberCookie = await login(member.email);
    const response = await openPortal(memberCookie);

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "INSUFFICIENT_PERMISSIONS",
    );

    assert.equal(customerReads, 0);
    assert.equal(portalRequests.length, 0);
  });

  it("rejects client-controlled customer IDs and return URLs", async () => {
    for (const body of [
      { customer: "cus_other" },
      { returnUrl: "https://example.com" },
      { configuration: "bpc_other" },
    ]) {
      const response = await request(app)
        .post(endpoint())
        .set("Cookie", ownerCookie)
        .send(body);

      assert.equal(response.status, 400);
    }

    assert.equal(customerReads, 0);
    assert.equal(portalRequests.length, 0);
  });

  it("requires an existing billing customer", async () => {
    await prisma.organizationBilling.delete({
      where: { organizationId },
    });

    const response = await openPortal();

    assert.equal(response.status, 409);
    assert.equal(
      response.body.code,
      "BILLING_CUSTOMER_REQUIRED",
    );

    assert.equal(customerReads, 0);
    assert.equal(portalRequests.length, 0);
  });

  it("uses the mapped customer and server-controlled return URL", async () => {
    const response = await openPortal();

    assert.equal(response.status, 200);

    assert.deepEqual(response.body.data, {
      url: "https://billing.stripe.com/p/session/test-motodesk",
    });

    assert.equal(customerReads, 1);
    assert.equal(portalRequests.length, 1);

    const input = portalRequests[0]!;

    assert.equal(input.customer, customerId);

    const returnUrl = new URL(input.return_url!);

    assert.equal(
      returnUrl.origin,
      new URL(env.CLIENT_URL).origin,
    );

    assert.equal(returnUrl.pathname, "/settings");
    assert.equal(
      returnUrl.searchParams.get("billing"),
      "portal",
    );

    assert.match(
      String(response.headers["cache-control"]),
      /no-store/i,
    );
  });

  it("allows exempt owners to manage existing billing", async () => {
    await prisma.platformAdmin.create({
      data: {
        userId: ownerId,
        role: "SUPER_ADMIN",
        billingExempt: true,
      },
    });

    const response = await openPortal();

    assert.equal(response.status, 200);
    assert.equal(portalRequests.length, 1);
    assert.equal(portalRequests[0]!.customer, customerId);
  });

  it("rejects a customer mapped to another organization", async () => {
    mappedOrganizationId = "another-organization";

    const response = await openPortal();

    assert.equal(response.status, 409);
    assert.equal(
      response.body.code,
      "BILLING_CUSTOMER_MAPPING_INVALID",
    );

    assert.equal(customerReads, 1);
    assert.equal(portalRequests.length, 0);
  });
});