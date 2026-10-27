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

import {
  Permissions,
} from "../../../src/modules/permissions/permission.constants.js";

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

describe("User-capacity HTTP access", () => {
  const password = "MotoDeskCapacityAccess123!";
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  let organizationId: string;
  let otherOrganizationId: string;
  let billingId: string;
  let ownerId: string;
  let memberMembershipId: string;
  let ownerCookie: string;
  let memberCookie: string;
  let stripeCalls: number;

  function endpoint(
    operation: "preview" | "confirm",
    targetOrganizationId = organizationId,
  ) {
    return `/api/v1/organizations/${targetOrganizationId}/billing/user-capacity/${operation}`;
  }

  function validBody(operation: "preview" | "confirm") {
    return operation === "preview"
      ? { additionalUserQuantity: 2 }
      : { changeId: randomUUID() };
  }

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email:
          `capacity-access-${label}-${randomUUID()}@example.com`
            .toLowerCase(),

        firstName: "Capacity",
        lastName: label,
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  async function login(email: string) {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password });

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    const switched = await request(app)
      .post("/api/v1/auth/switch-organization")
      .set("Cookie", accessCookie(response))
      .send({ organizationId });

    assert.equal(
      switched.status,
      200,
      JSON.stringify(switched.body),
    );

    return accessCookie(switched);
  }

  beforeEach(async () => {
    stripeCalls = 0;

    function unexpectedStripeCall(): never {
      stripeCalls += 1;
      throw new Error("This request must not reach Stripe.");
    }

    const stripe = getStripeClient();

    mock.method(
      stripe.customers,
      "retrieve",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.subscriptions,
      "retrieve",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.subscriptions,
      "list",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.subscriptions,
      "update",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.prices,
      "list",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.invoices,
      "createPreview",
      unexpectedStripeCall,
    );

    mock.method(
      stripe.invoices,
      "retrieve",
      unexpectedStripeCall,
    );

    for (const label of ["primary", "other"]) {
      const suffix = randomUUID();

      const organization = await prisma.organization.create({
        data: {
          name: `Capacity access ${label} ${suffix}`,
          slug: `capacity-access-${label}-${suffix}`,
        },
      });

      organizationIds.push(organization.id);

      if (label === "primary") {
        organizationId = organization.id;
      } else {
        otherOrganizationId = organization.id;
      }
    }

    const owner = await createUser("owner");
    const member = await createUser("member");

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
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });

    memberMembershipId = membership.id;

    // View permission alone must not permit a billing change.
    await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: memberMembershipId,
        permission: Permissions.BILLING_VIEW,
      },
    });

    const suffix = randomUUID();

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: `cus_access_${suffix}`,
        stripeSubscriptionId: `sub_access_${suffix}`,
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,
      },
    });

    billingId = billing.id;

    ownerCookie = await login(owner.email);
    memberCookie = await login(member.email);
  });

  afterEach(async () => {
    const calls = stripeCalls;

    mock.restoreAll();

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { organizationId: { in: organizationIds } },
          { actorUserId: { in: userIds } },
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

    organizationIds.length = 0;
    userIds.length = 0;

    assert.equal(calls, 0, "Rejected requests must not call Stripe.");
  });

  for (const operation of ["preview", "confirm"] as const) {
    it(`requires authentication for ${operation}`, async () => {
      const response = await request(app)
        .post(endpoint(operation))
        .send(validBody(operation));

      assert.equal(response.status, 401);
      assert.equal(
        response.body.code,
        "AUTHENTICATION_REQUIRED",
      );
    });

    it(`rejects another organization's ${operation} endpoint`, async () => {
      const response = await request(app)
        .post(endpoint(operation, otherOrganizationId))
        .set("Cookie", ownerCookie)
        .send(validBody(operation));

      assert.equal(response.status, 403);
      assert.equal(
        response.body.code,
        "ORGANIZATION_ACCESS_DENIED",
      );
    });

    it(`requires billing-update permission for ${operation}`, async () => {
      const response = await request(app)
        .post(endpoint(operation))
        .set("Cookie", memberCookie)
        .send(validBody(operation));

      assert.equal(response.status, 403);
      assert.equal(
        response.body.code,
        "INSUFFICIENT_PERMISSIONS",
      );
    });

    it(`rechecks email verification for ${operation}`, async () => {
      await prisma.user.update({
        where: { id: ownerId },
        data: {
          emailVerifiedAt: null,
        },
      });

      const response = await request(app)
        .post(endpoint(operation))
        .set("Cookie", ownerCookie)
        .send(validBody(operation));

      assert.equal(response.status, 403);
      assert.equal(
        response.body.code,
        "EMAIL_VERIFICATION_REQUIRED",
      );
    });

    it(`blocks exempt organizations before Stripe for ${operation}`, async () => {
      await prisma.platformAdmin.create({
        data: {
          userId: ownerId,
          role: "SUPER_ADMIN",
          billingExempt: true,
        },
      });

      const response = await request(app)
        .post(endpoint(operation))
        .set("Cookie", ownerCookie)
        .send(validBody(operation));

      assert.equal(response.status, 409);
      assert.equal(response.body.code, "BILLING_EXEMPT");

      assert.match(
        String(response.headers["cache-control"]),
        /no-store/i,
      );
    });
  }

  it("rejects invalid preview quantities and client-controlled billing fields", async () => {
    const invalidBodies = [
      {},
      { additionalUserQuantity: -1 },
      { additionalUserQuantity: 1.5 },
      { additionalUserQuantity: "2" },
      { additionalUserQuantity: null },
      { additionalUserQuantity: 2_147_483_648 },

      {
        additionalUserQuantity: 2,
        unitAmount: 1,
      },

      {
        additionalUserQuantity: 2,
        stripePriceId: "price_client_controlled",
      },

      {
        additionalUserQuantity: 2,
        organizationId: otherOrganizationId,
      },
    ];

    for (const body of invalidBodies) {
      const response = await request(app)
        .post(endpoint("preview"))
        .set("Cookie", ownerCookie)
        .send(body);

      assert.equal(
        response.status,
        400,
        JSON.stringify(body),
      );
      assert.equal(response.body.success, false);
    }

    assert.equal(
      await prisma.billingUserCapacityChange.count({
        where: {
          organizationBillingId: billingId,
        },
      }),
      0,
    );
  });

  it("rejects invalid confirmation IDs and extra confirmation fields", async () => {
    const invalidBodies = [
      {},
      { changeId: "invalid" },
      { changeId: null },

      {
        changeId: randomUUID(),
        additionalUserQuantity: 100,
      },

      {
        changeId: randomUUID(),
        payment_behavior: "allow_incomplete",
      },
    ];

    for (const body of invalidBodies) {
      const response = await request(app)
        .post(endpoint("confirm"))
        .set("Cookie", ownerCookie)
        .send(body);

      assert.equal(
        response.status,
        400,
        JSON.stringify(body),
      );
      assert.equal(response.body.success, false);
    }
  });

  it("does not let another billing-authorized member confirm the owner's preview", async () => {
    await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: memberMembershipId,
        permission: Permissions.BILLING_UPDATE,
      },
    });

    const change = await prisma.billingUserCapacityChange.create({
      data: {
        organizationBillingId: billingId,
        requestedByUserId: ownerId,

        stripeCustomerId: "cus_access_preview",
        stripeSubscriptionId: "sub_access_preview",

        expectedAdditionalUserQuantity: 0,
        targetAdditionalUserQuantity: 2,

        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",

        estimatedAmountDue: 500n,
        monthlyTotalAmount: 31_900n,

        stripeUpdateParameters: {},
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    const response = await request(app)
      .post(endpoint("confirm"))
      .set("Cookie", memberCookie)
      .send({
        changeId: change.id,
      });

    assert.equal(response.status, 404);
    assert.equal(
      response.body.code,
      "BILLING_CAPACITY_CHANGE_NOT_FOUND",
    );

    const unchanged =
      await prisma.billingUserCapacityChange.findUniqueOrThrow({
        where: { id: change.id },
      });

    assert.equal(unchanged.status, "QUOTED");
  });
});

//************************************************************** */