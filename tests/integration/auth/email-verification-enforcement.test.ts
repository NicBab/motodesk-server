import assert from "node:assert/strict";

import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

function createUniqueEmail(): string {
  return `email-verification-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}@motodesk.local`;
}

//************************************************************** */

function createUniqueSlug(): string {
  return `email-verification-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

//************************************************************** */

describe("Email verification enforcement integration", () => {
  it("blocks an authenticated unverified password user from organization access", async () => {
    const agent = request.agent(app);

    const email = createUniqueEmail();

    const organizationSlug = createUniqueSlug();

    //************************************************************** */
    // Registration creates the authenticated session, organization,
    // membership, and email-verification token. The new password
    // user's email remains unverified.

    const registerResponse = await agent.post("/api/v1/auth/register").send({
      email,

      password: "MotoDeskTest123!",

      firstName: "Email",

      lastName: "Verification",

      organization: {
        name: "Email Verification Test",

        slug: organizationSlug,
      },
    });

    assert.equal(registerResponse.status, 201);

    assert.equal(registerResponse.body?.success, true);

    const organizationId =
      registerResponse.body?.data?.membership?.organizationId;

    assert.equal(typeof organizationId, "string");

    //************************************************************** */
    // Identity/bootstrap information remains available while the
    // user is waiting to verify their email.

    const meResponse = await agent.get("/api/v1/auth/me");

    assert.equal(meResponse.status, 200);

    assert.equal(meResponse.body?.success, true);

    //************************************************************** */
    // Organization business access must be rejected until the
    // authenticated user's email has been verified.

    const organizationResponse = await agent.get(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(organizationResponse.status, 403);

    assert.equal(organizationResponse.body?.success, false);

    assert.equal(
      organizationResponse.body?.message,
      "Verify your email address to continue.",
    );
  });

  //************************************************************** */

  it("allows an authenticated verified user to access their organization", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const response = await agent.get(`/api/v1/organizations/${organizationId}`);

    assert.equal(response.status, 200);

    assert.equal(response.body?.success, true);
  });
});

//************************************************************** */
