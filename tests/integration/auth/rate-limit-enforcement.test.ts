import assert from "node:assert/strict";

import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";

import { env } from "../../../src/config/env.js";

import { randomUUID } from "node:crypto";

//************************************************************** */

describe("Auth rate limit enforcement integration", () => {
  it("rate limits repeated login attempts for the same identity", async () => {
    const email = `rate-limit-${Date.now()}@motodesk.test`;

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", env.CLIENT_URL)
        .send({
          email,

          password: "InvalidPassword123!",
        });

      assert.notEqual(response.status, 429);

      assert.notEqual(response.body?.code, "RATE_LIMIT_EXCEEDED");
    }

    const blockedResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", env.CLIENT_URL)
      .send({
        email,

        password: "InvalidPassword123!",
      });

    assert.equal(blockedResponse.status, 429);

    assert.equal(blockedResponse.body?.code, "RATE_LIMIT_EXCEEDED");

    assert.equal(blockedResponse.headers["ratelimit-limit"], "10");

    assert.equal(blockedResponse.headers["ratelimit-remaining"], "0");

    assert.ok(blockedResponse.headers["retry-after"]);
  });
  it("rate limits repeated reauthentication attempts", async () => {
    const suffix = randomUUID();

    const email = `reauth-rate-limit-${suffix}@motodesk.local`;

    const password = "MotoDesk-RateLimit-Test-2026!";

    const agent = request.agent(app);

    //************************************************************** */
    // Create an authenticated local-password account.

    const registrationResponse = await agent
      .post("/api/v1/auth/register")
      .send({
        email,

        password,

        firstName: "Rate",

        lastName: "Limit",

        organizationName: `Rate Limit ${suffix}`,
      });

    assert.equal(registrationResponse.status, 201);

    //************************************************************** */
    // Incorrect current-password attempts must eventually exhaust
    // the dedicated reauthentication limiter.

    let rateLimitedResponse: request.Response | undefined;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await agent.post("/api/v1/auth/reauthenticate").send({
        currentPassword: `Incorrect-Password-${attempt}!`,
      });

      if (response.status === 429) {
        rateLimitedResponse = response;

        break;
      }

      assert.equal(response.status, 401);

      assert.equal(response.body.code, "CURRENT_PASSWORD_INCORRECT");
    }

    //************************************************************** */

    assert.ok(
      rateLimitedResponse,
      "Expected repeated reauthentication attempts to be rate limited.",
    );

    assert.equal(rateLimitedResponse.status, 429);

    assert.equal(rateLimitedResponse.body.success, false);

    assert.equal(rateLimitedResponse.body.code, "RATE_LIMIT_EXCEEDED");

    assert.equal(typeof rateLimitedResponse.headers["retry-after"], "string");
  });
  it("does not allow X-Forwarded-For rotation to bypass the login rate limit", async () => {
    const suffix = randomUUID();

    const email = `proxy-rate-limit-${suffix}@motodesk.local`;

    const password = "MotoDesk-RateLimit-Test-2026!";

    //************************************************************** */
    // Create a real account so every login attempt reaches password
    // verification rather than exercising an unknown-account path.

    const registrationResponse = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email,

        password,

        firstName: "Proxy",

        lastName: "Security",

        organizationName: `Proxy Security ${suffix}`,
      });

    assert.equal(registrationResponse.status, 201);

    //************************************************************** */
    // Rotate the forwarded address for every attempt.
    //
    // TRUST_PROXY=0 means an arbitrary client-supplied
    // X-Forwarded-For header must not become Express's request.ip.
    // All attempts should therefore consume the same login bucket.

    let rateLimitedResponse: request.Response | undefined;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", `203.0.113.${attempt + 1}`)
        .send({
          email,

          password: `Incorrect-Password-${attempt}!`,
        });

      if (response.status === 429) {
        rateLimitedResponse = response;

        break;
      }

      assert.equal(response.status, 401);
    }

    //************************************************************** */

    assert.ok(
      rateLimitedResponse,
      "Expected login attempts to be rate limited despite rotating X-Forwarded-For.",
    );

    assert.equal(rateLimitedResponse.status, 429);

    assert.equal(rateLimitedResponse.body.success, false);

    assert.equal(rateLimitedResponse.body.code, "RATE_LIMIT_EXCEEDED");

    assert.equal(typeof rateLimitedResponse.headers["retry-after"], "string");
  });
});

//************************************************************** */
