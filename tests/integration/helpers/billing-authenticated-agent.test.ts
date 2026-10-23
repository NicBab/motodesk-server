import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { after } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

//************************************************************** */

const fixtures: {
  organizationId: string;
  userId: string;
}[] = [];

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

// Preserve the existing helper's return contract while using
// isolated users, organizations, and local billing fixtures.
//
// No Stripe API requests are made.
export async function createAuthenticatedAgent() {
  const suffix = randomUUID();
  const password = "MotoDeskIsolatedBilling123!";

  const user = await prisma.user.create({
    data: {
      email: `billing-fixture-${suffix}@example.com`,
      firstName: "Billing",
      lastName: "Fixture",
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  let organizationId: string;

  try {
    const organization = await prisma.organization.create({
      data: {
        name: `Billing fixture ${suffix}`,
        slug: `billing-fixture-${suffix}`,
      },
    });

    organizationId = organization.id;
  } catch (error) {
    await prisma.user.delete({
      where: { id: user.id },
    });

    throw error;
  }

  fixtures.push({
    organizationId,
    userId: user.id,
  });

  const membership = await prisma.membership.create({
    data: {
      organizationId,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  await prisma.organizationBilling.create({
    data: {
      organizationId,
      planId: "pro",
      status: "TRIALING",
      currency: "usd",
      unitAmount: 29_900,
      trialStartedAt: new Date(),
      trialEndsAt: new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1_000,
      ),
    },
  });

  const agent = request.agent(app);

  const loginResponse = await agent
    .post("/api/v1/auth/login")
    .send({
      email: user.email,
      password,
    });

  assert.equal(
    loginResponse.status,
    200,
    `Fixture login failed: ${JSON.stringify(loginResponse.body)}`,
  );

  // Explicit cookies also work when development settings mark
  // cookies Secure but the integration transport uses HTTP.
  agent.set("Cookie", accessCookie(loginResponse));

  const switchResponse = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  assert.equal(
    switchResponse.status,
    200,
    `Fixture organization switch failed: ${JSON.stringify(switchResponse.body)}`,
  );

  agent.set("Cookie", accessCookie(switchResponse));

  return {
    agent,
    organizationId,
    membershipId: membership.id,
  };
}

//************************************************************** */

after(async () => {
  if (fixtures.length === 0) {
    return;
  }

  const organizationIds = fixtures.map(
    (fixture) => fixture.organizationId,
  );

  const userIds = fixtures.map(
    (fixture) => fixture.userId,
  );

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        {
          organizationId: {
            in: organizationIds,
          },
        },
        {
          actorUserId: {
            in: userIds,
          },
        },
      ],
    },
  });

  await prisma.organization.deleteMany({
    where: {
      id: {
        in: organizationIds,
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: {
        in: userIds,
      },
    },
  });

  fixtures.length = 0;
});

//************************************************************** */