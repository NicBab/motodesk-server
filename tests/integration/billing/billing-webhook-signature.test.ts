import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, it } from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { env } from "../../../src/config/env.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

//************************************************************** */

const endpoint = "/api/v1/billing/webhook";

function createPayload(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify(
    {
      id: `evt_test_${randomUUID()}`,
      object: "event",
      created: Math.floor(Date.now() / 1_000),
      livemode: false,
      type: "product.updated",

      data: {
        object: {
          id: `prod_test_${randomUUID()}`,
          object: "product",
          name: "Webhook signature test",
        },
      },

      ...overrides,
    },
    null,
    2,
  );
}

function signPayload(
  payload: string,
  timestamp = Math.floor(Date.now() / 1_000),
  secret = env.STRIPE_WEBHOOK_SECRET,
): string {
  assert.ok(secret, "STRIPE_WEBHOOK_SECRET must be configured.");

  return getStripeClient().webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp,
  });
}

function sendSigned(
  payload: string,
  signature = signPayload(payload),
) {
  return request(app)
    .post(endpoint)
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", signature)
    .send(payload);
}

//************************************************************** */

describe("Billing webhook signature verification", () => {
  before(() => {
    assert.equal(
      env.STRIPE_MODE,
      "test",
      "Run these tests with STRIPE_MODE=test.",
    );

    assert.ok(
      env.STRIPE_SECRET_KEY,
      "Configure the sandbox STRIPE_SECRET_KEY.",
    );

    assert.ok(
      env.STRIPE_WEBHOOK_SECRET,
      "Configure STRIPE_WEBHOOK_SECRET before running these tests.",
    );
  });

  it("rejects requests without a signature", async () => {
    const response = await request(app)
      .post(endpoint)
      .set("Content-Type", "application/json")
      .send(createPayload());

    assert.equal(response.status, 400);
    assert.equal(
      response.body.code,
      "BILLING_WEBHOOK_SIGNATURE_REQUIRED",
    );
  });

  it("rejects signatures made with a different secret", async () => {
    const payload = createPayload();

    const signature = signPayload(
      payload,
      Math.floor(Date.now() / 1_000),
      `whsec_wrong_${randomUUID()}`,
    );

    const response = await sendSigned(payload, signature);

    assert.equal(response.status, 400);
    assert.equal(
      response.body.code,
      "BILLING_WEBHOOK_SIGNATURE_INVALID",
    );
  });

  it("rejects a body modified after signing", async () => {
    const payload = createPayload();
    const signature = signPayload(payload);

    const modified = payload.replace(
      "Webhook signature test",
      "Modified after signing",
    );

    const response = await sendSigned(modified, signature);

    assert.equal(response.status, 400);
    assert.equal(
      response.body.code,
      "BILLING_WEBHOOK_SIGNATURE_INVALID",
    );
  });

  it("rejects an expired signature timestamp", async () => {
    const payload = createPayload();

    const signature = signPayload(
      payload,
      Math.floor(Date.now() / 1_000) - 3_600,
    );

    const response = await sendSigned(payload, signature);

    assert.equal(response.status, 400);
    assert.equal(
      response.body.code,
      "BILLING_WEBHOOK_SIGNATURE_INVALID",
    );
  });

  it("rejects live events in the test environment", async () => {
    const payload = createPayload({
      livemode: true,
    });

    const response = await sendSigned(payload);

    assert.equal(response.status, 400);
    assert.equal(
      response.body.code,
      "BILLING_WEBHOOK_MODE_INVALID",
    );
  });

  it("rejects connected-account events", async () => {
    const payload = createPayload({
      account: `acct_test_${randomUUID()}`,
    });

    const response = await sendSigned(payload);

    assert.equal(response.status, 400);
    assert.equal(
      response.body.code,
      "BILLING_WEBHOOK_ACCOUNT_UNSUPPORTED",
    );
  });

  it("rejects signed content that is not valid JSON", async () => {
    const payload = "{invalid-json";
    const response = await sendSigned(payload);

    assert.equal(response.status, 400);
    assert.equal(
      response.body.code,
      "BILLING_WEBHOOK_SIGNATURE_INVALID",
    );
  });

  it("verifies an unchanged raw body and acknowledges unsupported events", async () => {
    // Indented JSON helps detect parsing and reserialization before
    // signature verification, which would change the signed bytes.
    const payload = createPayload();

    const response = await sendSigned(payload);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.data, {
      received: true,
    });

    assert.match(
      String(response.headers["cache-control"]),
      /no-store/i,
    );

    assert.equal(
      JSON.stringify(response.body).includes(
        env.STRIPE_WEBHOOK_SECRET!,
      ),
      false,
    );
  });
});