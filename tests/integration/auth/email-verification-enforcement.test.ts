import assert from "node:assert/strict";

import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

import { prisma } from "../../../src/config/prisma.js";

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
  it("blocks organization access immediately after a verified user changes their email", async () => {
    const agent = request.agent(app);

    const originalEmail = createUniqueEmail();

    const newEmail = createUniqueEmail();

    const organizationSlug = createUniqueSlug();

    const password = "MotoDeskTest123!";

    //************************************************************** */
    // Register a dedicated account for this lifecycle test.

    const registerResponse = await agent.post("/api/v1/auth/register").send({
      email: originalEmail,

      password,

      firstName: "Email",

      lastName: "Change",

      organization: {
        name: "Email Change Verification Test",

        slug: organizationSlug,
      },
    });

    assert.equal(registerResponse.status, 201);

    const organizationId =
      registerResponse.body?.data?.membership?.organizationId;

    assert.equal(typeof organizationId, "string");

    //************************************************************** */
    // Registration intentionally starts unverified. For this test we
    // need the opposite starting condition: a legitimately verified
    // account that subsequently replaces its email.
    //
    // Mark this test user's ORIGINAL address verified directly. This
    // isolates the email-change transition from the already-covered
    // verification-code lifecycle.

    const userId = registerResponse.body?.data?.user?.id;

    assert.equal(typeof userId, "string");

    await prisma.user.update({
      where: {
        id: userId,
      },

      data: {
        emailVerifiedAt: new Date(),
      },
    });

    //************************************************************** */
    // Prove the account has organization access before changing its
    // verified email.

    const beforeChangeResponse = await agent.get(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(beforeChangeResponse.status, 200);

    assert.equal(beforeChangeResponse.body?.success, true);

    //************************************************************** */
    // Replace the verified email address.

    const changeEmailResponse = await agent
      .post("/api/v1/auth/change-email")
      .send({
        newEmail,

        currentPassword: password,
      });

    assert.equal(changeEmailResponse.status, 200);

    assert.equal(changeEmailResponse.body?.success, true);

    assert.equal(changeEmailResponse.body?.data?.user?.email, newEmail);

    assert.equal(changeEmailResponse.body?.data?.user?.emailVerifiedAt, null);

    //************************************************************** */
    // Authentication/bootstrap remains available so the client can
    // send the user through email verification.

    const meResponse = await agent.get("/api/v1/auth/me");

    assert.equal(meResponse.status, 200);

    assert.equal(meResponse.body?.data?.user?.email, newEmail);

    assert.equal(meResponse.body?.data?.user?.emailVerifiedAt, null);

    //************************************************************** */
    // Business access must disappear immediately after the verified
    // address is replaced.

    const afterChangeResponse = await agent.get(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(afterChangeResponse.status, 403);

    assert.equal(afterChangeResponse.body?.success, false);

    assert.equal(
      afterChangeResponse.body?.message,
      "Verify your email address to continue.",
    );
  });
});

//************************************************************** */
