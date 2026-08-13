import request from "supertest";

import { app } from "../../../src/app.js";

//************************************************************** */

const DEV_USER_EMAIL =
  "dev.owner@motodesk.local";

const DEV_USER_PASSWORD =
  "MotoDeskDev123!";

const DEV_ORGANIZATION_SLUG =
  "motodesk-dev-shop";

//************************************************************** */

type OrganizationMembershipResponse = {
  organization?: {
    id?: unknown;
    slug?: unknown;
  };
};

//************************************************************** */

export async function createAuthenticatedAgent() {
  const agent =
    request.agent(app);

  // Login with the seeded development owner.
  const loginResponse =
    await agent
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
  const organizationsResponse =
    await agent.get(
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

  const membership =
    memberships.find(
      (
        item: OrganizationMembershipResponse,
      ) =>
        item.organization?.slug ===
        DEV_ORGANIZATION_SLUG,
    );

  const organizationId =
    membership?.organization?.id;

  if (
    typeof organizationId !== "string"
  ) {
    throw new Error(
      `Seeded organization "${DEV_ORGANIZATION_SLUG}" was not found.`,
    );
  }

  // Switch the access token into the seeded organization.
  const switchResponse =
    await agent
      .post(
        "/api/v1/auth/switch-organization",
      )
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
  };
}