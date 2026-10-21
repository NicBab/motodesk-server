import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import {
  BillingSubscriptionStatus,
} from "../../../src/generated/prisma/client.js";

import {
  applyBillingSynchronization,
  type PreparedBillingSynchronization,
} from "../../../src/modules/billing/billing-sync.service.js";

//************************************************************** */

describe("Billing synchronization writes", () => {
  let organizationId: string;
  let customerId: string;
  let subscriptionId: string;

  beforeEach(async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Billing sync ${suffix}`,
        slug: `billing-sync-${suffix}`,
      },
    });

    organizationId = organization.id;
    customerId = `cus_test_${suffix}`;
    subscriptionId = `sub_test_${suffix}`;

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
      },
    });
  });

  afterEach(async () => {
    if (organizationId) {
      await prisma.organization.deleteMany({
        where: {
          id: organizationId,
        },
      });
    }
  });

  function prepared(
    expectedLastSyncedAt: Date | null = null,
  ): PreparedBillingSynchronization {
    return {
      organizationId,
      stripeCustomerId: customerId,
      expectedLastSyncedAt,

      firstTrialStartedAt: new Date(
        "2026-01-01T00:00:00.000Z",
      ),

      snapshot: {
        stripeSubscriptionId: subscriptionId,
        stripePriceId: `price_test_${randomUUID()}`,
        planId: "starter",

        status: BillingSubscriptionStatus.TRIALING,

        currency: "usd",
        unitAmount: 8_900,

        currentPeriodStart: new Date(
          "2026-01-01T00:00:00.000Z",
        ),

        currentPeriodEnd: new Date(
          "2026-01-15T00:00:00.000Z",
        ),

        cancelAtPeriodEnd: false,
        cancelAt: null,
        canceledAt: null,
        endedAt: null,

        trialStartedAt: new Date(
          "2026-01-01T00:00:00.000Z",
        ),

        trialEndsAt: new Date(
          "2026-01-15T00:00:00.000Z",
        ),
      },
    };
  }

  async function apply(
    input: PreparedBillingSynchronization,
  ): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      await applyBillingSynchronization(transaction, input);
    });
  }

  async function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: {
        organizationId,
      },
    });
  }

  it("writes validated subscription fields and the retained first trial date", async () => {
    const input = prepared();

    // Synchronization receives the earliest historical trial
    // separately from the currently selected subscription.
    input.firstTrialStartedAt = new Date(
      "2025-12-01T00:00:00.000Z",
    );

    await apply(input);

    const billing = await readBilling();

    assert.equal(billing.stripeSubscriptionId, subscriptionId);
    assert.equal(billing.stripePriceId, input.snapshot.stripePriceId);
    assert.equal(billing.planId, "starter");
    assert.equal(billing.status, "TRIALING");
    assert.equal(billing.currency, "usd");
    assert.equal(billing.unitAmount, 8_900);

    assert.equal(
      billing.trialStartedAt?.toISOString(),
      "2025-12-01T00:00:00.000Z",
    );

    assert.equal(
      billing.trialEndsAt?.toISOString(),
      "2026-01-15T00:00:00.000Z",
    );

    assert.ok(billing.lastSyncedAt);
  });

  it("allows only one concurrent write from the same baseline", async () => {
    const first = prepared();
    const second = prepared();

    second.snapshot.status = BillingSubscriptionStatus.ACTIVE;

    const results = await Promise.allSettled([
      apply(first),
      apply(second),
    ]);

    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );

    assert.equal(
      results.filter((result) => result.status === "rejected").length,
      1,
    );

    const billing = await readBilling();

    assert.ok(billing.lastSyncedAt);

    assert.ok(
      billing.status === BillingSubscriptionStatus.TRIALING ||
      billing.status === BillingSubscriptionStatus.ACTIVE,
    );
  });

  it("rejects stale snapshots without reverting the latest subscription state", async () => {
    const stale = prepared();

    await apply(prepared());

    const baseline = await readBilling();
    assert.ok(baseline.lastSyncedAt);

    const latest = prepared(baseline.lastSyncedAt);

    latest.snapshot.status = BillingSubscriptionStatus.CANCELED;
    latest.snapshot.canceledAt = new Date();
    latest.snapshot.endedAt = new Date();

    await apply(latest);

    await assert.rejects(
      apply(stale),
      { code: "BILLING_SYNC_RETRY_REQUIRED" },
    );

    const billing = await readBilling();

    assert.equal(billing.status, "CANCELED");

    assert.equal(
      billing.stripePriceId,
      latest.snapshot.stripePriceId,
    );
  });

  it("rejects a customer mapping mismatch without changing billing", async () => {
    const input = prepared();

    input.stripeCustomerId = `cus_other_${randomUUID()}`;

    await assert.rejects(
      apply(input),
      { code: "BILLING_SYNC_RETRY_REQUIRED" },
    );

    const billing = await readBilling();

    assert.equal(billing.stripeCustomerId, customerId);
    assert.equal(billing.status, "NOT_SUBSCRIBED");
    assert.equal(billing.stripeSubscriptionId, null);
    assert.equal(billing.lastSyncedAt, null);
  });

  it("advances the synchronization marker even when the prior marker is ahead of the clock", async () => {
    const previous = new Date(Date.now() + 60_000);

    await prisma.organizationBilling.update({
      where: {
        organizationId,
      },

      data: {
        lastSyncedAt: previous,
      },
    });

    await apply(prepared(previous));

    const billing = await readBilling();

    assert.equal(
      billing.lastSyncedAt?.getTime(),
      previous.getTime() + 1,
    );
  });
});