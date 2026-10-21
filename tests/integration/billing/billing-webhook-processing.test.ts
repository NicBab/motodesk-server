import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  describe,
  it,
} from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import {
  claimBillingWebhookEvent,
  completeBillingWebhookEvent,
  releaseFailedBillingWebhookEvent,
  type BillingWebhookRecordInput,
} from "../../../src/modules/billing/billing-webhook.repository.js";

//************************************************************** */

const eventIds: string[] = [];
const organizationIds: string[] = [];

function eventInput(): BillingWebhookRecordInput {
  const id = `evt_test_${randomUUID()}`;

  eventIds.push(id);

  return {
    id,
    type: "customer.subscription.updated",
    livemode: false,
    eventCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    stripeObjectId: `sub_test_${randomUUID()}`,
  };
}

async function claimEvent() {
  const input = eventInput();
  const claim = await claimBillingWebhookEvent(input);

  assert.equal(claim.status, "claimed");

  if (claim.status !== "claimed") {
    throw new Error("Expected an acquired webhook claim.");
  }

  return {
    input,
    token: claim.processingToken,
  };
}

//************************************************************** */

describe("Billing webhook processing claims", () => {
  afterEach(async () => {
    await prisma.stripeWebhookEvent.deleteMany({
      where: {
        id: { in: eventIds },
      },
    });

    await prisma.organization.deleteMany({
      where: {
        id: { in: organizationIds },
      },
    });

    eventIds.length = 0;
    organizationIds.length = 0;
  });

  it("allows only one concurrent claim for the same event", async () => {
    const input = eventInput();

    const results = await Promise.all([
      claimBillingWebhookEvent(input),
      claimBillingWebhookEvent(input),
    ]);

    assert.deepEqual(
      results.map((result) => result.status).sort(),
      ["busy", "claimed"],
    );

    const stored = await prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: input.id },
    });

    assert.equal(stored.attemptCount, 1);
    assert.equal(stored.processedAt, null);
    assert.ok(stored.processingToken);
  });

  it("recognizes completed duplicates without running changes again", async () => {
    const { input, token } = await claimEvent();

    let applied = 0;

    const completed = await completeBillingWebhookEvent(
      input.id,
      token,
      async () => {
        applied += 1;
      },
    );

    assert.equal(completed, true);

    const duplicate = await claimBillingWebhookEvent(input);
    assert.equal(duplicate.status, "processed");

    const repeatedCompletion = await completeBillingWebhookEvent(
      input.id,
      token,
      async () => {
        applied += 1;
      },
    );

    assert.equal(repeatedCompletion, false);
    assert.equal(applied, 1);
  });

  it("reclaims expired leases and fences out the old worker", async () => {
    const { input, token } = await claimEvent();

    await prisma.stripeWebhookEvent.update({
      where: { id: input.id },

      data: {
        processingLeaseUntil: new Date(Date.now() - 1_000),
      },
    });

    const replacement = await claimBillingWebhookEvent(input);

    assert.equal(replacement.status, "claimed");

    if (replacement.status !== "claimed") {
      throw new Error("Expected a replacement claim.");
    }

    assert.notEqual(replacement.processingToken, token);

    let staleWorkerRan = false;

    const staleCompletion = await completeBillingWebhookEvent(
      input.id,
      token,
      async () => {
        staleWorkerRan = true;
      },
    );

    assert.equal(staleCompletion, false);
    assert.equal(staleWorkerRan, false);

    // An old worker cannot release a replacement worker's claim.
    await releaseFailedBillingWebhookEvent(input.id, token);

    const stored = await prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: input.id },
    });

    assert.equal(
      stored.processingToken,
      replacement.processingToken,
    );

    assert.equal(stored.attemptCount, 2);

    const completed = await completeBillingWebhookEvent(
      input.id,
      replacement.processingToken,
      async () => {},
    );

    assert.equal(completed, true);
  });

  it("rejects completion after lease expiry even without a replacement", async () => {
    const { input, token } = await claimEvent();

    await prisma.stripeWebhookEvent.update({
      where: { id: input.id },

      data: {
        processingLeaseUntil: new Date(Date.now() - 1_000),
      },
    });

    let applied = false;

    const completed = await completeBillingWebhookEvent(
      input.id,
      token,
      async () => {
        applied = true;
      },
    );

    assert.equal(completed, false);
    assert.equal(applied, false);
  });

  it("releases failed claims for another attempt", async () => {
    const { input, token } = await claimEvent();

    await releaseFailedBillingWebhookEvent(input.id, token);

    const released = await prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: input.id },
    });

    assert.equal(released.processingToken, null);
    assert.equal(released.processingLeaseUntil, null);
    assert.equal(released.processedAt, null);
    assert.equal(
      released.lastErrorCode,
      "BILLING_WEBHOOK_PROCESSING_FAILED",
    );

    const retry = await claimBillingWebhookEvent(input);

    assert.equal(retry.status, "claimed");

    const retried = await prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: input.id },
    });

    assert.equal(retried.attemptCount, 2);
    assert.equal(retried.lastErrorCode, null);
  });

  it("rolls back billing changes and completion together", async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Billing rollback ${suffix}`,
        slug: `billing-rollback-${suffix}`,
      },
    });

    organizationIds.push(organization.id);

    await prisma.organizationBilling.create({
      data: {
        organizationId: organization.id,
      },
    });

    const { input, token } = await claimEvent();

    await assert.rejects(
      completeBillingWebhookEvent(
        input.id,
        token,
        async (transaction) => {
          await transaction.organizationBilling.update({
            where: {
              organizationId: organization.id,
            },

            data: {
              planId: "starter",
            },
          });

          throw new Error("Simulated billing update failure.");
        },
      ),
      /Simulated billing update failure/,
    );

    const billing = await prisma.organizationBilling.findUniqueOrThrow({
      where: {
        organizationId: organization.id,
      },
    });

    const event = await prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: input.id },
    });

    assert.equal(billing.planId, null);
    assert.equal(event.processedAt, null);
    assert.equal(event.processingToken, token);

    await releaseFailedBillingWebhookEvent(input.id, token);

    const retry = await claimBillingWebhookEvent(input);
    assert.equal(retry.status, "claimed");
  });

  it("does not accept conflicting data as a completed duplicate", async () => {
    const { input, token } = await claimEvent();

    await completeBillingWebhookEvent(
      input.id,
      token,
      async () => {},
    );

    const conflicting = await claimBillingWebhookEvent({
      ...input,
      stripeObjectId: `sub_different_${randomUUID()}`,
    });

    assert.equal(conflicting.status, "busy");
  });
});