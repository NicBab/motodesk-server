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

import type {
  PreparedBillingSynchronization,
} from "../../../src/modules/billing/billing-sync.service.js";

import {
  applyConfirmedBillingUserCapacityChange,
  recordPendingBillingUserCapacityChange,
  recordRejectedBillingUserCapacityChange,
  recordUnconfirmedBillingUserCapacityChange,
} from "../../../src/modules/billing/billing-user-capacity-outcome.repository.js";

//************************************************************** */

describe("Billing user-capacity outcome repository", () => {
  let organizationId: string;
  let ownerId: string;
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;
  let baseline: Date;
  let submittedAt: Date;

  function prepared(): PreparedBillingSynchronization {
    return {
      organizationId,
      stripeCustomerId: customerId,
      expectedLastSyncedAt: baseline,

      firstTrialStartedAt: null,

      snapshot: {
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_outcome_pro",
        planId: "pro",
        status: BillingSubscriptionStatus.ACTIVE,

        currency: "usd",
        unitAmount: 29_900,

        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: "price_outcome_additional",
        stripeAdditionalUserItemId: "si_outcome_additional",

        currentPeriodStart: new Date(
          "2026-10-01T00:00:00.000Z",
        ),

        currentPeriodEnd: new Date(
          "2026-11-01T00:00:00.000Z",
        ),

        cancelAtPeriodEnd: false,
        cancelAt: null,
        canceledAt: null,
        endedAt: null,
        trialStartedAt: null,
        trialEndsAt: null,
      },
    };
  }

  function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  function readChange() {
    return prisma.billingUserCapacityChange.findUniqueOrThrow({
      where: { id: changeId },
    });
  }

  function apply(input = prepared()) {
    return applyConfirmedBillingUserCapacityChange(
      organizationId,
      changeId,
      input,
    );
  }

  beforeEach(async () => {
    organizationId = "";
    ownerId = "";

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Capacity outcome ${suffix}`,
        slug: `capacity-outcome-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await prisma.user.create({
      data: {
        email: `capacity-outcome-${suffix}@example.com`,
        firstName: "Capacity",
        lastName: "Outcome",
        emailVerifiedAt: new Date(),
      },
    });

    ownerId = owner.id;

    await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    customerId = `cus_outcome_${suffix}`;
    subscriptionId = `sub_outcome_${suffix}`;

    baseline = new Date(Date.now() - 60_000);
    submittedAt = new Date(Date.now() - 30_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_outcome_pro",
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,
        lastSyncedAt: baseline,
      },
    });

    const change = await prisma.billingUserCapacityChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId: ownerId,
        status: "PROCESSING",

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,

        expectedAdditionalUserQuantity: 0,
        targetAdditionalUserQuantity: 2,
        expectedLastSyncedAt: baseline,

        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",

        estimatedAmountDue: 1_000n,
        monthlyTotalAmount: 31_900n,

        stripeUpdateParameters: {
          items: [
            {
              price: "price_outcome_additional",
              quantity: 2,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
        },

        expiresAt: new Date(Date.now() + 600_000),
        submittedAt,
      },
    });

    changeId = change.id;

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: changeId,
      },
    });
  });

  afterEach(async () => {
    if (organizationId) {
      await prisma.organization.deleteMany({
        where: { id: organizationId },
      });
    }

    if (ownerId) {
      await prisma.user.deleteMany({
        where: { id: ownerId },
      });
    }
  });

  it("records pending payment without granting additional users", async () => {
    const result = await recordPendingBillingUserCapacityChange(
      organizationId,
      changeId,
      "in_outcome_pending",
    );

    assert.equal(result.status, "PENDING_PAYMENT");
    assert.equal(result.stripeInvoiceId, "in_outcome_pending");

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, changeId);
  });

  it("releases a definitively rejected operation without changing capacity", async () => {
    const result = await recordRejectedBillingUserCapacityChange(
      organizationId,
      changeId,
    );

    assert.equal(result.status, "REJECTED");
    assert.equal(
      result.lastErrorCode,
      "BILLING_CAPACITY_CHANGE_REJECTED",
    );

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, null);
    assert.equal(billing.lastSyncedAt?.getTime(), baseline.getTime());
  });

  it("preserves an unconfirmed operation and its original submission time", async () => {
    const before = await readChange();

    const result = await recordUnconfirmedBillingUserCapacityChange(
      organizationId,
      changeId,
    );

    assert.equal(result.status, "PROCESSING");
    assert.equal(
      result.lastErrorCode,
      "BILLING_CAPACITY_CHANGE_UNCONFIRMED",
    );

    assert.equal(
      result.submittedAt?.getTime(),
      submittedAt.getTime(),
    );

    assert.deepEqual(
      result.stripeUpdateParameters,
      before.stripeUpdateParameters,
    );

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, changeId);
  });

  it("atomically applies verified capacity and completes its operation", async () => {
    const result = await apply();

    assert.equal(result.status, "APPLIED");
    assert.ok(result.appliedAt);
    assert.equal(result.lastErrorCode, null);

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.additionalUserUnitAmount, 1_000);
    assert.equal(
      billing.stripeAdditionalUserPriceId,
      "price_outcome_additional",
    );
    assert.equal(
      billing.stripeAdditionalUserItemId,
      "si_outcome_additional",
    );
    assert.equal(billing.activeUserCapacityChangeId, null);

    assert.ok(billing.lastSyncedAt);
    assert.ok(
      billing.lastSyncedAt.getTime() > baseline.getTime(),
    );
  });

  it("rolls back completion when the prepared snapshot is stale", async () => {
    const stale = prepared();
    const newerMarker = new Date(baseline.getTime() + 1);

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        lastSyncedAt: newerMarker,
      },
    });

    await assert.rejects(
      apply(stale),
      { code: "BILLING_SYNC_RETRY_REQUIRED" },
    );

    const billing = await readBilling();
    const change = await readChange();

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, changeId);
    assert.equal(
      billing.lastSyncedAt?.getTime(),
      newerMarker.getTime(),
    );

    assert.equal(change.status, "PROCESSING");
    assert.equal(change.appliedAt, null);
  });

  it("rejects a verified quantity that differs from the requested target", async () => {
    const input = prepared();
    input.snapshot.additionalUserQuantity = 3;

    await assert.rejects(
      apply(input),
      { code: "BILLING_CAPACITY_RECONCILIATION_REQUIRED" },
    );

    assert.equal(
      (await readBilling()).additionalUserQuantity,
      0,
    );
    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("rejects a prepared snapshot for another organization", async () => {
    const input = prepared();
    input.organizationId = `other_${randomUUID()}`;

    await assert.rejects(
      apply(input),
      { code: "BILLING_CAPACITY_RECONCILIATION_REQUIRED" },
    );

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      changeId,
    );
    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("does not let a delayed rejection overwrite pending payment", async () => {
    await recordPendingBillingUserCapacityChange(
      organizationId,
      changeId,
      "in_outcome_pending",
    );

    const result = await recordRejectedBillingUserCapacityChange(
      organizationId,
      changeId,
    );

    assert.equal(result.status, "PENDING_PAYMENT");
    assert.equal(result.stripeInvoiceId, "in_outcome_pending");

    const billing = await readBilling();

    assert.equal(billing.activeUserCapacityChangeId, changeId);
    assert.equal(billing.additionalUserQuantity, 0);
  });

  it("does not let delayed errors overwrite an applied operation", async () => {
    await apply();

    const rejected = await recordRejectedBillingUserCapacityChange(
      organizationId,
      changeId,
    );

    const unconfirmed =
      await recordUnconfirmedBillingUserCapacityChange(
        organizationId,
        changeId,
      );

    assert.equal(rejected.status, "APPLIED");
    assert.equal(unconfirmed.status, "APPLIED");

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activeUserCapacityChangeId, null);
  });

  it("returns an applied operation without applying its snapshot twice", async () => {
    const input = prepared();
    const first = await apply(input);

    const afterFirst = await readBilling();

    // This input now has an old baseline. Idempotent completion
    // must return the existing result without another sync write.
    const second = await apply(input);
    const afterSecond = await readBilling();

    assert.equal(second.id, first.id);
    assert.equal(second.status, "APPLIED");

    assert.equal(
      second.appliedAt?.getTime(),
      first.appliedAt?.getTime(),
    );

    assert.equal(
      afterSecond.lastSyncedAt?.getTime(),
      afterFirst.lastSyncedAt?.getTime(),
    );
  });

  it("rejects a conflicting invoice mapping without replacing the original", async () => {
    await recordPendingBillingUserCapacityChange(
      organizationId,
      changeId,
      "in_original",
    );

    await assert.rejects(
      recordPendingBillingUserCapacityChange(
        organizationId,
        changeId,
        "in_conflicting",
      ),
      { code: "BILLING_CAPACITY_RECONCILIATION_REQUIRED" },
    );

    const change = await readChange();

    assert.equal(change.status, "PENDING_PAYMENT");
    assert.equal(change.stripeInvoiceId, "in_original");

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      changeId,
    );
  });
});

//************************************************************** */