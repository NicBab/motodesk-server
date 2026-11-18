
import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

//************************************************************** */

const DEV_USER_EMAIL = "dev.owner@motodesk.local";

const DEV_USER_PASSWORD = "MotoDeskDev123!";

const DEV_ORGANIZATION_SLUG = "motodesk-dev-shop";

//************************************************************** */

type OrganizationMembershipResponse = {
  id?: unknown;

  organization?: {
    id?: unknown;
    slug?: unknown;
  };
};

//************************************************************** */

export async function createAuthenticatedAgent() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.STRIPE_MODE === "live"
  ) {
    throw new Error(
      "Development test fixtures must not run in production or Stripe live mode.",
    );
  }

  const agent = request.agent(app);

  // Login with the seeded development owner.

  const loginResponse = await agent
    .post("/api/v1/auth/login")
    .send({
      email: DEV_USER_EMAIL,
      password: DEV_USER_PASSWORD,
    });

  if (
    loginResponse.status !== 200 ||
    loginResponse.body?.success !== true
  ) {
    throw new Error(
      `Dev login failed with status ${loginResponse.status}.`,
    );
  }

  // Load the organizations available to the seeded user.

  const organizationsResponse = await agent.get(
    "/api/v1/organizations/me",
  );

  if (
    organizationsResponse.status !== 200 ||
    organizationsResponse.body?.success !== true
  ) {
    throw new Error(
      `Organization lookup failed with status ${organizationsResponse.status}.`,
    );
  }

  const memberships =
    organizationsResponse.body.data;

  if (!Array.isArray(memberships)) {
    throw new Error(
      "Organization lookup did not return an array.",
    );
  }

  const membership = memberships.find(
    (item: OrganizationMembershipResponse) =>
      item.organization?.slug ===
      DEV_ORGANIZATION_SLUG,
  );

  const organizationId =
    membership?.organization?.id;

  const membershipId = membership?.id;

  if (typeof organizationId !== "string") {
    throw new Error(
      `Seeded organization "${DEV_ORGANIZATION_SLUG}" was not found.`,
    );
  }

  if (typeof membershipId !== "string") {
    throw new Error(
      `Seeded membership for organization "${DEV_ORGANIZATION_SLUG}" was not found.`,
    );
  }

  //************************************************************** */
  // Establish a valid local billing fixture.
  //
  // Subscription enforcement remains enabled.
  // No Stripe API requests are made.

  const existingBilling =
    await prisma.organizationBilling.findUnique({
      where: {
        organizationId,
      },
    });

  if (
    existingBilling?.stripeCustomerId ||
    existingBilling?.stripeSubscriptionId ||
    existingBilling?.checkoutOperationId ||
    existingBilling?.checkoutSessionId ||
    existingBilling?.activeUserCapacityChangeId ||
    existingBilling?.activePlanChangeId
  ) {
    throw new Error(
      "The seeded organization has existing Stripe billing associations or pending operations. Use a disposable test organization instead.",
    );
  }

  const now = new Date();

  const trialEndsAt = new Date(
    now.getTime() +
      14 * 24 * 60 * 60 * 1000,
  );

  await prisma.organizationBilling.upsert({
    where: {
      organizationId,
    },

    create: {
      organizationId,
      planId: "pro",
      status: "TRIALING",
      currency: "usd",
      unitAmount: 29_900,
      trialStartedAt: now,
      trialEndsAt,
    },

    update: {
      planId: "pro",
      status: "TRIALING",
      currency: "usd",
      unitAmount: 29_900,
      trialStartedAt: now,
      trialEndsAt,
      endedAt: null,
      canceledAt: null,
      cancelAt: null,
      cancelAtPeriodEnd: false,
    },
  });

  //************************************************************** */
  // Switch the access token into the seeded organization.

  const switchResponse = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  if (
    switchResponse.status !== 200 ||
    switchResponse.body?.success !== true
  ) {
    throw new Error(
      `Organization switch failed with status ${switchResponse.status}.`,
    );
  }

  return {
    agent,
    organizationId,
    membershipId,
  };
}

//************************************************************** */
