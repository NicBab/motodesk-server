import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../src/app.js";

//************************************************************** */

async function createAuthenticatedAgent() {
  const suffix = randomUUID();

  const agent = request.agent(app);

  const registrationResponse = await agent.post("/api/v1/auth/register").send({
    email: `cache-security-${suffix}@motodesk.local`,

    password: "MotoDesk-Cache-Security-2026!",

    firstName: "Cache",

    lastName: "Security",

    organizationName: `Cache Security ${suffix}`,
  });

  assert.equal(registrationResponse.status, 201);

  return agent;
}

//************************************************************** */

function assertPrivateNoStore(response: request.Response) {
  const cacheControl = response.headers["cache-control"];

  assert.equal(typeof cacheControl, "string");

  const directives = cacheControl
    .toLowerCase()
    .split(",")
    .map((value) => value.trim());

  assert.equal(directives.includes("no-store"), true);

  assert.equal(directives.includes("private"), true);
}

//************************************************************** */

describe("Sensitive response cache security", () => {
  it("prevents caching of the authenticated user response", async () => {
    const agent = await createAuthenticatedAgent();

    const response = await agent.get("/api/v1/auth/me");

    assert.equal(response.status, 200);

    assertPrivateNoStore(response);
  });

  //************************************************************** */

  it("prevents caching of session-management responses", async () => {
    const agent = await createAuthenticatedAgent();

    const response = await agent.get("/api/v1/auth/sessions");

    assert.equal(response.status, 200);

    assertPrivateNoStore(response);
  });

  //************************************************************** */

  it("prevents caching of authentication responses that set credentials", async () => {
    const suffix = randomUUID();

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `cache-registration-${suffix}@motodesk.local`,

        password: "MotoDesk-Cache-Security-2026!",

        firstName: "Cache",

        lastName: "Registration",

        organizationName: `Cache Registration ${suffix}`,
      });

    assert.equal(response.status, 201);

    assertPrivateNoStore(response);
  });
});

//************************************************************** */
