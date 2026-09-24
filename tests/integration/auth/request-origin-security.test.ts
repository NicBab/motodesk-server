import assert from "node:assert/strict";

import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";

import { env } from "../../../src/config/env.js";

//************************************************************** */

describe("Request origin security integration", () => {
  it("allows mutation requests from the configured client origin", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", env.CLIENT_URL)
      .send({
        email: "origin-security-test@motodesk.test",

        password: "InvalidPassword123!",
      });

    //************************************************************** */
    // Authentication itself may fail because these credentials are
    // intentionally invalid. The important assertion is that the
    // origin middleware did not reject the request.

    assert.notEqual(response.status, 403);

    assert.notEqual(response.body?.code, "REQUEST_ORIGIN_NOT_ALLOWED");
  });

  //************************************************************** */

  it("rejects mutation requests from a foreign origin", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://attacker.example")
      .send({
        email: "origin-security-test@motodesk.test",

        password: "InvalidPassword123!",
      });

    assert.equal(response.status, 403);

    assert.equal(response.body?.code, "REQUEST_ORIGIN_NOT_ALLOWED");
  });

  //************************************************************** */

  it("allows safe GET requests regardless of browser origin", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://attacker.example");

    assert.notEqual(response.status, 403);

    assert.notEqual(response.body?.code, "REQUEST_ORIGIN_NOT_ALLOWED");
  });

  //************************************************************** */

  it("allows mutation requests without browser origin metadata", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "origin-security-test@motodesk.test",

      password: "InvalidPassword123!",
    });

    assert.notEqual(response.status, 403);

    assert.notEqual(response.body?.code, "REQUEST_ORIGIN_NOT_ALLOWED");
  });

  //************************************************************** */

  it("allows mutation requests when the referer resolves to the configured client origin", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Referer", `${env.CLIENT_URL}/login`)
      .send({
        email: "origin-security-test@motodesk.test",

        password: "InvalidPassword123!",
      });

    assert.notEqual(response.status, 403);

    assert.notEqual(response.body?.code, "REQUEST_ORIGIN_NOT_ALLOWED");
  });

  //************************************************************** */

  it("rejects mutation requests when the referer resolves to a foreign origin", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Referer", "https://attacker.example/fake-login")
      .send({
        email: "origin-security-test@motodesk.test",

        password: "InvalidPassword123!",
      });

    assert.equal(response.status, 403);

    assert.equal(response.body?.code, "REQUEST_ORIGIN_NOT_ALLOWED");
  });
});

//************************************************************** */
