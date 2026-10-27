import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import type {
  PreparedBillingSynchronization,
} from "../../../src/modules/billing/billing-sync.service.js";

import {
  applyConfirmedBillingPlanChange,
  recordPendingBillingPlanChange,
  recordRejectedBillingPlanChange,
  recordUnconfirmedBillingPlanChange,
} from "../../../src/modules/billing/billing-plan-change-outcome.repository.js";

//************************************************************** */

describe("Billing plan-change outcome repository", () => {
  let organizationId: string;
  let ownerId: string;
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;
  let baseline: Date;
  let submittedAt: Date;
  let prorationDate: number;

  function prepared(): PreparedBillingSynchronization {
    return {
      organizationId,
      stripeCustomerId: customerId,
      expectedLastSyncedAt: baseline,
      firstTrialStartedAt: null,

      snapshot: {
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_plan_outcome_pro",
        planId: "pro",
        status: "ACTIVE",

        currency: "usd",
        unitAmount: 29_900,

        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId:
          "price_plan_outcome_additional",
        stripeAdditionalUserItemId:
          "si_plan_outcome_additional",

        currentPeriodStart: new Date("2026-10-01T00:00:00Z"),
        currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),

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
    return prisma.billingPlanChange.findUniqueOrThrow({
      where: { id: changeId },
    });
  }

  function apply(input = prepared()) {
    return applyConfirmedBillingPlanChange(
      organizationId,
      changeId,
      input,
    );
  }

  function recordPending(invoiceId = "in_plan_outcome_pending") {
    return recordPendingBillingPlanChange(
      organizationId,
      changeId,
      invoiceId,
    );
  }

  beforeEach(async () => {
    organizationId = "";
    ownerId = "";

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Plan outcome ${suffix}`,
        slug: `plan-outcome-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await prisma.user.create({
      data: {
        email: `plan-outcome-${suffix}@example.com`,
        firstName: "Plan",
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

    customerId = `cus_plan_outcome_${suffix}`;
    subscriptionId = `sub_plan_outcome_${suffix}`;
    baseline = new Date(Date.now() - 60_000);
    submittedAt = new Date(Date.now() - 30_000);
    prorationDate = Math.floor(Date.now() / 1_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_plan_outcome_starter",
        planId: "starter",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 8_900,
        lastSyncedAt: baseline,
      },
    });

    const change = await prisma.billingPlanChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId: ownerId,
        status: "PROCESSING",

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedStripePriceId: "price_plan_outcome_starter",

        expectedPlanId: "starter",
        targetPlanId: "pro",

        expectedAdditionalUserQuantity: 0,
        targetAdditionalUserQuantity: 2,
        expectedLastSyncedAt: baseline,

        prorationDate,
        currency: "usd",
        estimatedAmountDue: 1_000n,
        monthlyTotalAmount: 31_900n,

        stripeUpdateParameters: {
          items: [
            {
              id: "si_plan_outcome_base",
              price: "price_plan_outcome_pro",
              quantity: 1,
            },
            {
              price: "price_plan_outcome_additional",
              quantity: 2,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        },

        expiresAt: new Date(Date.now() + 600_000),
        submittedAt,
      },
    });

    changeId = change.id;

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { activePlanChangeId: changeId },
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

  it("records pending payment without applying the plan or capacity", async () => {
    const result = await recordPending();

    assert.equal(result.status, "PENDING_PAYMENT");
    assert.equal(result.stripeInvoiceId, "in_plan_outcome_pending");

    const billing = await readBilling();

    assert.equal(billing.planId, "starter");
    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activePlanChangeId, changeId);
  });

  it("releases a definitively rejected operation without changing billing", async () => {
    const result = await recordRejectedBillingPlanChange(
      organizationId,
      changeId,
    );

    assert.equal(result.status, "REJECTED");
    assert.equal(result.lastErrorCode, "BILLING_PLAN_CHANGE_REJECTED");

    const billing = await readBilling();

    assert.equal(billing.planId, "starter");
    assert.equal(billing.activePlanChangeId, null);
    assert.equal(billing.lastSyncedAt?.getTime(), baseline.getTime());
  });

  it("preserves an uncertain operation and its original request", async () => {
    const before = await readChange();

    const result = await recordUnconfirmedBillingPlanChange(
      organizationId,
      changeId,
    );

    assert.equal(result.status, "PROCESSING");
    assert.equal(
      result.lastErrorCode,
      "BILLING_PLAN_CHANGE_UNCONFIRMED",
    );
    assert.equal(result.submittedAt?.getTime(), submittedAt.getTime());

    assert.deepEqual(
      result.stripeUpdateParameters,
      before.stripeUpdateParameters,
    );

    assert.equal((await readBilling()).activePlanChangeId, changeId);
  });

  it("atomically applies the target plan, additional users, and operation outcome", async () => {
    const result = await apply();

    assert.equal(result.status, "APPLIED");
    assert.ok(result.appliedAt);
    assert.equal(result.lastErrorCode, null);

    const billing = await readBilling();

    assert.equal(billing.planId, "pro");
    assert.equal(billing.stripePriceId, "price_plan_outcome_pro");
    assert.equal(billing.unitAmount, 29_900);
    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.additionalUserUnitAmount, 1_000);
    assert.equal(billing.activePlanChangeId, null);

    assert.ok(billing.lastSyncedAt);
    assert.ok(billing.lastSyncedAt.getTime() > baseline.getTime());
  });

  it("rolls back completion when the synchronization baseline is stale", async () => {
    const input = prepared();
    const newerMarker = new Date(baseline.getTime() + 1);

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { lastSyncedAt: newerMarker },
    });

    await assert.rejects(apply(input), {
      code: "BILLING_SYNC_RETRY_REQUIRED",
    });

    const billing = await readBilling();
    const change = await readChange();

    assert.equal(billing.planId, "starter");
    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activePlanChangeId, changeId);
    assert.equal(billing.lastSyncedAt?.getTime(), newerMarker.getTime());

    assert.equal(change.status, "PROCESSING");
    assert.equal(change.appliedAt, null);
  });

  it("rejects snapshots that do not match the confirmed target terms", async () => {
    const invalidSnapshots: Partial<
      PreparedBillingSynchronization["snapshot"]
    >[] = [
      { planId: "business" },
      { stripePriceId: "price_unconfirmed_pro" },
      { additionalUserQuantity: 3 },
      { stripeAdditionalUserPriceId: "price_unconfirmed_additional" },
      { additionalUserUnitAmount: 500 },
      { currency: "eur" },
    ];

    for (const overrides of invalidSnapshots) {
      const input = prepared();
      Object.assign(input.snapshot, overrides);

      await assert.rejects(apply(input), {
        code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
      });
    }

    assert.equal((await readBilling()).planId, "starter");
    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("rejects a prepared synchronization for another organization", async () => {
    const input = prepared();
    input.organizationId = `other_${randomUUID()}`;

    await assert.rejects(apply(input), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });

    assert.equal((await readBilling()).activePlanChangeId, changeId);
  });

  it("does not let delayed errors overwrite pending payment", async () => {
    await recordPending();

    const rejected = await recordRejectedBillingPlanChange(
      organizationId,
      changeId,
    );

    const unconfirmed = await recordUnconfirmedBillingPlanChange(
      organizationId,
      changeId,
    );

    assert.equal(rejected.status, "PENDING_PAYMENT");
    assert.equal(unconfirmed.status, "PENDING_PAYMENT");
    assert.equal(unconfirmed.stripeInvoiceId, "in_plan_outcome_pending");

    assert.equal((await readBilling()).activePlanChangeId, changeId);
  });

  it("does not let delayed errors or pending results overwrite an applied change", async () => {
    await apply();

    const results = [
      await recordRejectedBillingPlanChange(organizationId, changeId),
      await recordUnconfirmedBillingPlanChange(organizationId, changeId),
      await recordPending(),
    ];

    for (const result of results) {
      assert.equal(result.status, "APPLIED");
    }

    assert.equal((await readBilling()).planId, "pro");
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("returns an applied result without synchronizing the same snapshot twice", async () => {
    const input = prepared();
    const first = await apply(input);
    const afterFirst = await readBilling();

    const second = await apply(input);
    const afterSecond = await readBilling();

    assert.equal(second.id, first.id);
    assert.equal(second.appliedAt?.getTime(), first.appliedAt?.getTime());
    assert.equal(
      afterSecond.lastSyncedAt?.getTime(),
      afterFirst.lastSyncedAt?.getTime(),
    );
  });

  it("preserves the original invoice mapping when a conflicting invoice is supplied", async () => {
    await recordPending("in_original");

    await assert.rejects(recordPending("in_conflicting"), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });

    assert.equal((await readChange()).stripeInvoiceId, "in_original");
    assert.equal((await readBilling()).activePlanChangeId, changeId);
  });

  it("does not clear or replace a different active plan claim", async () => {
    const otherClaimId = randomUUID();

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { activePlanChangeId: otherClaimId },
    });

    await assert.rejects(
      recordRejectedBillingPlanChange(organizationId, changeId),
      { code: "BILLING_PLAN_RECONCILIATION_REQUIRED" },
    );

    await assert.rejects(apply(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });

    assert.equal((await readBilling()).activePlanChangeId, otherClaimId);
    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("blocks outcomes when a competing capacity-operation pointer exists", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: randomUUID(),
      },
    });

    await assert.rejects(recordPending(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });

    await assert.rejects(apply(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });

    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("preserves the first-trial history and synchronized trial end", async () => {
    const trialStart = new Date("2026-10-20T00:00:00Z");
    const trialEnd = new Date("2026-11-03T00:00:00Z");

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        status: "TRIALING",
        trialStartedAt: trialStart,
        trialEndsAt: trialEnd,
      },
    });

    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: {
        stripeUpdateParameters: {
          items: [
            {
              id: "si_plan_outcome_base",
              price: "price_plan_outcome_pro",
              quantity: 1,
            },
            {
              price: "price_plan_outcome_additional",
              quantity: 2,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "none",
        },
      },
    });

    const input = prepared();
    input.firstTrialStartedAt = trialStart;
    input.snapshot.status = "TRIALING";
    input.snapshot.trialStartedAt = trialStart;
    input.snapshot.trialEndsAt = trialEnd;

    await apply(input);

    const billing = await readBilling();

    assert.equal(billing.status, "TRIALING");
    assert.equal(billing.trialStartedAt?.getTime(), trialStart.getTime());
    assert.equal(billing.trialEndsAt?.getTime(), trialEnd.getTime());
  });

  it("atomically removes Pro additional-user fields during a downgrade", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        planId: "pro",
        stripePriceId: "price_plan_outcome_pro",
        unitAmount: 29_900,
        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: "price_plan_outcome_additional",
        stripeAdditionalUserItemId: "si_plan_outcome_additional",
      },
    });

    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: {
        expectedPlanId: "pro",
        targetPlanId: "business",
        expectedStripePriceId: "price_plan_outcome_pro",
        expectedAdditionalUserQuantity: 2,
        targetAdditionalUserQuantity: 0,
        monthlyTotalAmount: 18_900n,

        stripeUpdateParameters: {
          items: [
            {
              id: "si_plan_outcome_base",
              price: "price_plan_outcome_business",
              quantity: 1,
            },
            {
              id: "si_plan_outcome_additional",
              deleted: true,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        },
      },
    });

    const input = prepared();

    Object.assign(input.snapshot, {
      planId: "business",
      stripePriceId: "price_plan_outcome_business",
      unitAmount: 18_900,
      additionalUserQuantity: 0,
      additionalUserUnitAmount: null,
      stripeAdditionalUserPriceId: null,
      stripeAdditionalUserItemId: null,
    });

    await apply(input);

    const billing = await readBilling();

    assert.equal(billing.planId, "business");
    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.additionalUserUnitAmount, null);
    assert.equal(billing.stripeAdditionalUserPriceId, null);
    assert.equal(billing.stripeAdditionalUserItemId, null);
    assert.equal(billing.activePlanChangeId, null);
  });

  it("rejects applying an unclaimed preview", async () => {
    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: {
        status: "QUOTED",
        submittedAt: null,
      },
    });

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { activePlanChangeId: null },
    });

    await assert.rejects(apply(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });

    assert.equal((await readBilling()).planId, "starter");
    assert.equal((await readChange()).status, "QUOTED");
  });
});

//************************************************************** */