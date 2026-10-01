import assert from "node:assert/strict";

import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../src/app.js";

//************************************************************** */

describe("Request input security", () => {
  it("rejects malformed JSON as a client error", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":"test@example.com","password":');

    assert.equal(response.status, 400);

    assert.equal(response.body.success, false);

    assert.equal(response.body.code, "MALFORMED_JSON");

    assert.equal(response.body.message, "Malformed JSON request body.");

    //************************************************************** */
    // Parser internals must not leak through the API response.

    const serializedBody = JSON.stringify(response.body);

    assert.equal(serializedBody.includes("SyntaxError"), false);

    assert.equal(serializedBody.includes("JSON.parse"), false);
  });

  //************************************************************** */

  it("rejects oversized JSON request bodies", async () => {
    const oversizedValue = "x".repeat(150 * 1024);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send({
        email: "oversized@example.com",

        password: oversizedValue,
      });

    assert.equal(response.status, 413);

    assert.equal(response.body.success, false);

    assert.equal(response.body.code, "PAYLOAD_TOO_LARGE");

    assert.equal(response.body.message, "Request body is too large.");
  });

  //************************************************************** */

  it("rejects oversized URL-encoded request bodies", async () => {
    const oversizedValue = "x".repeat(150 * 1024);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .type("form")
      .send({
        email: "oversized@example.com",

        password: oversizedValue,
      });

    assert.equal(response.status, 413);

    assert.equal(response.body.success, false);

    assert.equal(response.body.code, "PAYLOAD_TOO_LARGE");
  });

  //************************************************************** */

  it("continues to accept normal JSON requests", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "normal-request@example.com",

      password: "Normal-Test-Password-2026!",
    });

    //************************************************************** */
    // The account intentionally does not exist.
    //
    // Reaching the authentication layer and receiving an ordinary
    // authentication response proves that the JSON parser accepted
    // the normal-sized request.

    assert.equal(response.status, 401);

    assert.notEqual(response.body.code, "MALFORMED_JSON");

    assert.notEqual(response.body.code, "PAYLOAD_TOO_LARGE");
  });

  //************************************************************** */

  it("does not expose parser implementation details for oversized bodies", async () => {
    const oversizedValue = "x".repeat(150 * 1024);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send({
        email: "oversized-details@example.com",

        password: oversizedValue,
      });

    assert.equal(response.status, 413);

    const serializedBody = JSON.stringify(response.body).toLowerCase();

    assert.equal(serializedBody.includes("payloadtoolargeerror"), false);

    assert.equal(serializedBody.includes("body-parser"), false);

    assert.equal(serializedBody.includes("node_modules"), false);

    assert.equal(serializedBody.includes("stack"), false);
  });
});

//************************************************************** */
