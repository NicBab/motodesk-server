import assert from "node:assert/strict";
import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { env } from "../../../src/config/env.js";

//************************************************************** */

const probePath = "/api/v1/platform-origin-test-probe";

function requireAdminOrigin(): string {
  assert.ok(
    env.ADMIN_URL,
    "Configure ADMIN_URL=http://localhost:3002 before running these tests.",
  );

  return env.ADMIN_URL;
}

//************************************************************** */

describe("Platform admin browser origins integration", () => {
  it("allows credentialed CORS for the configured admin origin", async () => {
    const origin = requireAdminOrigin();

    const response = await request(app)
      .get("/")
      .set("Origin", origin);

    assert.equal(response.status, 200);
    assert.equal(
      response.headers["access-control-allow-origin"],
      origin,
    );
    assert.equal(
      response.headers["access-control-allow-credentials"],
      "true",
    );
  });

  //************************************************************** */

  it("preserves credentialed CORS for the client origin", async () => {
    const origin = new URL(env.CLIENT_URL).origin;

    const response = await request(app)
      .get("/")
      .set("Origin", origin);

    assert.equal(response.status, 200);
    assert.equal(
      response.headers["access-control-allow-origin"],
      origin,
    );
    assert.equal(
      response.headers["access-control-allow-credentials"],
      "true",
    );
  });

  //************************************************************** */

  it("allows admin mutation preflight requests", async () => {
    const origin = requireAdminOrigin();

    const response = await request(app)
      .options("/api/v1/auth/login")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    assert.equal(response.status, 204);
    assert.equal(
      response.headers["access-control-allow-origin"],
      origin,
    );
    assert.equal(
      response.headers["access-control-allow-credentials"],
      "true",
    );

    const methods = String(
      response.headers["access-control-allow-methods"],
    ).split(",");

    assert.ok(methods.includes("POST"));
  });

  //************************************************************** */

  it("allows mutations from both configured application origins", async () => {
    const origins = [
      new URL(env.CLIENT_URL).origin,
      requireAdminOrigin(),
    ];

    for (const origin of origins) {
      const response = await request(app)
        .post(probePath)
        .set("Origin", origin)
        .send({});

      // The deliberately unknown route returns 404 after passing
      // the origin middleware, without exercising login rate limits.
      assert.equal(response.status, 404, origin);
      assert.equal(
        response.headers["access-control-allow-origin"],
        origin,
      );
    }
  });

  //************************************************************** */

  it("accepts the admin Referer fallback", async () => {
    const origin = requireAdminOrigin();

    const response = await request(app)
      .post(probePath)
      .set("Referer", `${origin}/login`)
      .send({});

    assert.equal(response.status, 404);
  });

  //************************************************************** */

  it("rejects untrusted, null, and lookalike origins", async () => {
    const adminOrigin = requireAdminOrigin();

    const untrustedOrigins = [
      "https://untrusted.example",
      "null",
      `${adminOrigin}.untrusted.example`,
    ];

    for (const origin of untrustedOrigins) {
      const response = await request(app)
        .post(probePath)
        .set("Origin", origin)
        .send({});

      assert.equal(response.status, 403, origin);
      assert.equal(response.body.success, false);
      assert.equal(
        response.headers["access-control-allow-origin"],
        undefined,
      );
    }
  });

  //************************************************************** */

  it("gives Origin precedence over an allowed Referer", async () => {
    const response = await request(app)
      .post(probePath)
      .set("Origin", "https://untrusted.example")
      .set("Referer", `${requireAdminOrigin()}/login`)
      .send({});

    assert.equal(response.status, 403);
    assert.equal(
      response.headers["access-control-allow-origin"],
      undefined,
    );
  });

  //************************************************************** */

  it("rejects malformed and untrusted Referer values", async () => {
    for (const referer of [
      "not-a-url",
      "https://untrusted.example/login",
    ]) {
      const response = await request(app)
        .post(probePath)
        .set("Referer", referer)
        .send({});

      assert.equal(response.status, 403, referer);
    }
  });

  //************************************************************** */

  it("preserves requests without browser-origin metadata", async () => {
    const response = await request(app)
      .post(probePath)
      .send({});

    assert.equal(response.status, 404);
  });

  //************************************************************** */

  it("does not grant platform access through an allowed origin", async () => {
    const response = await request(app)
      .get("/api/v1/platform/me")
      .set("Origin", requireAdminOrigin());

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });
});

//************************************************************** */