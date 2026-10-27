import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, it, mock } from "node:test";

import type Stripe from "stripe";

import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";
import { getStripeClient } from "../../../src/config/stripe.js";

import {
  getBillingPlan,
  type BillingPlanId,
} from "../../../src/modules/billing/billing.constants.js";

import {
  prepareBillingSynchronization,
  type PreparedBillingSynchronization,
} from "../../../src/modules/billing/billing-sync.service.js";

import { applyBillingUserCapacityReconciliation } from "../../../src/modules/billing/billing-user-capacity-reconciliation.service.js";

import {
  applyBillingPlanChangeReconciliation,
  prepareBillingPlanChangeReconciliation,
  type PreparedPlanChangeReconciliation,
} from "../../../src/modules/billing/billing-plan-change-reconciliation.service.js";

//************************************************************** */

describe("Billing plan-change webhook reconciliation", () => {
  let organizationId: string;
  let ownerId: string;
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;
  let baseline: Date;
  let periodStart: number;
  let periodEnd: number;

  let current: ReturnType<typeof subscription>;

  function price(id: string, lookupKey: string, unitAmount: number) {
    return {
      id,
      lookup_key: lookupKey,
      livemode: false,
      type: "recurring",
      billing_scheme: "per_unit",
      currency: "usd",
      unit_amount: unitAmount,
      transform_quantity: null,
      custom_unit_amount: null,

      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "licensed",
      },
    };
  }

  function subscription(
    planId: BillingPlanId = "starter",
    quantity = 0,
    pending = false,
  ) {
    const plan = getBillingPlan(planId);

    const items = [
      {
        id: "si_plan_reconciliation_base",
        quantity: 1,
        current_period_start: periodStart,
        current_period_end: periodEnd,

        price: price(
          `price_plan_reconciliation_${planId}`,
          plan.stripeLookupKey,
          plan.unitAmount,
        ),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_plan_reconciliation_additional",
        quantity,
        current_period_start: periodStart,
        current_period_end: periodEnd,

        price: price(
          "price_plan_reconciliation_additional",
          "pro-additional-user-monthly",
          1_000,
        ),
      });
    }

    return {
      id: subscriptionId,
      object: "subscription",
      customer: customerId,
      livemode: false,
      metadata: { organizationId },
      collection_method: "charge_automatically",
      currency: "usd",
      status: "active",
      created: periodStart,

      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_start: null,
      trial_end: null,

      pending_update: pending ? { expires_at: periodEnd } : null,

      latest_invoice: "in_plan_reconciliation",
      schedule: null,

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function event(matchesOperation = false): Stripe.Event {
    // Only fields consumed by reconciliation are included.
    return {
      id: `evt_${randomUUID()}`,
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1_000),
      livemode: false,

      request: {
        id: `req_${randomUUID()}`,
        idempotency_key: matchesOperation
          ? `motodesk:test:plan-change:${changeId}`
          : "another-operation",
      },

      data: {
        object: current,
      },
    } as unknown as Stripe.Event;
  }

  async function prepareSnapshot() {
    const prepared = await prepareBillingSynchronization(customerId);
    assert.ok(prepared);
    return prepared;
  }

  async function prepare(matchesOperation = false) {
    const prepared = await prepareSnapshot();

    const reconciliation = await prepareBillingPlanChangeReconciliation(
      event(matchesOperation),
      prepared,
    );

    return { prepared, reconciliation };
  }

  function apply(
    prepared: PreparedBillingSynchronization,
    reconciliation: PreparedPlanChangeReconciliation | null,
  ) {
    return prisma.$transaction(async (transaction) => {
      // The existing capacity reconciliation function applies
      // shared subscription synchronization once.
      await applyBillingUserCapacityReconciliation(transaction, prepared, null);

      await applyBillingPlanChangeReconciliation(
        transaction,
        prepared,
        reconciliation,
      );
    });
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

  function mapInvoice() {
    return prisma.billingPlanChange.update({
      where: { id: changeId },
      data: {
        stripeInvoiceId: "in_plan_reconciliation",
      },
    });
  }

  beforeEach(async () => {
    organizationId = "";
    ownerId = "";

    assert.equal(env.STRIPE_MODE, "test");

    periodStart = Math.floor(Date.now() / 1_000) - 3_600;
    periodEnd = periodStart + 30 * 86_400;

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Plan reconciliation ${suffix}`,
        slug: `plan-reconciliation-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await prisma.user.create({
      data: {
        email: `plan-reconciliation-${suffix}@example.com`,
        firstName: "Plan",
        lastName: "Reconciliation",
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

    customerId = `cus_plan_reconciliation_${suffix}`;
    subscriptionId = `sub_plan_reconciliation_${suffix}`;
    baseline = new Date(Date.now() - 60_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_plan_reconciliation_starter",
        planId: "starter",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 8_900,
        lastSyncedAt: baseline,
      },
    });

    const prorationDate = Math.floor(Date.now() / 1_000);

    const change = await prisma.billingPlanChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId: ownerId,
        status: "PROCESSING",

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedStripePriceId: "price_plan_reconciliation_starter",

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
              id: "si_plan_reconciliation_base",
              price: "price_plan_reconciliation_pro",
              quantity: 1,
            },
            {
              price: "price_plan_reconciliation_additional",
              quantity: 2,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        },

        expiresAt: new Date(Date.now() + 600_000),
        submittedAt: new Date(Date.now() - 30_000),
      },
    });

    changeId = change.id;

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { activePlanChangeId: changeId },
    });

    current = subscription();

    const stripe = getStripeClient();

    mock.method(stripe.subscriptions, "list", async () => ({
      data: [current],
      has_more: false,
    }));

    mock.method(stripe.subscriptions, "retrieve", async () => current);

    mock.method(stripe.invoices, "retrieve", async () => ({
      id: "in_plan_reconciliation",
      customer: customerId,
      livemode: false,
      status: "void",
    }));
  });

  afterEach(async () => {
    mock.restoreAll();

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

  it("applies the current target subscription and completes the operation", async () => {
    current = subscription("pro", 2);

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation?.outcome, "APPLIED");
    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "APPLIED");
    assert.ok((await readChange()).appliedAt);

    const billing = await readBilling();

    assert.equal(billing.planId, "pro");
    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activePlanChangeId, null);
  });

  it("preserves known pending payment without applying the upgrade", async () => {
    await mapInvoice();
    current = subscription("starter", 0, true);

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation?.outcome, "PENDING_PAYMENT");
    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "PENDING_PAYMENT");
    assert.equal((await readBilling()).planId, "starter");
    assert.equal((await readBilling()).activePlanChangeId, changeId);
  });

  it("recovers a missing invoice mapping from the exact operation event", async () => {
    current = subscription("starter", 0, true);

    const { prepared, reconciliation } = await prepare(true);

    assert.equal(reconciliation?.outcome, "PENDING_PAYMENT");
    await apply(prepared, reconciliation);

    assert.equal(
      (await readChange()).stripeInvoiceId,
      "in_plan_reconciliation",
    );
    assert.equal((await readChange()).status, "PENDING_PAYMENT");
  });

  it("does not attribute an unrelated pending update to the operation", async () => {
    current = subscription("starter", 0, true);

    const { prepared, reconciliation } = await prepare(false);

    assert.equal(reconciliation, null);
    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal((await readChange()).stripeInvoiceId, null);
    assert.equal((await readBilling()).activePlanChangeId, changeId);
  });

  it("releases an unapplied operation after its mapped invoice is void", async () => {
    await mapInvoice();

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation?.outcome, "EXPIRED");
    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "EXPIRED");
    assert.equal((await readBilling()).planId, "starter");
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("retains the claim while the mapped invoice remains payable", async () => {
    await mapInvoice();

    mock.method(getStripeClient().invoices, "retrieve", async () => ({
      id: "in_plan_reconciliation",
      customer: customerId,
      livemode: false,
      status: "open",
    }));

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation, null);
    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal((await readBilling()).activePlanChangeId, changeId);
  });

  it("rejects a mapped invoice belonging to another customer", async () => {
    await mapInvoice();

    mock.method(getStripeClient().invoices, "retrieve", async () => ({
      id: "in_plan_reconciliation",
      customer: "cus_other",
      livemode: false,
      status: "void",
    }));

    await assert.rejects(prepare(), {
      code: "BILLING_PLAN_RECONCILIATION_RETRY_REQUIRED",
    });

    assert.equal((await readChange()).status, "PROCESSING");
    assert.equal(
      (await readBilling()).lastSyncedAt?.getTime(),
      baseline.getTime(),
    );
  });

  it("retries when Stripe state changes between preparation reads", async () => {
    const prepared = await prepareSnapshot();

    current = subscription("pro", 2);

    await assert.rejects(
      prepareBillingPlanChangeReconciliation(event(), prepared),
      { code: "BILLING_PLAN_RECONCILIATION_RETRY_REQUIRED" },
    );

    assert.equal((await readBilling()).planId, "starter");
  });

  it("does not clear a different active operation pointer", async () => {
    current = subscription("pro", 2);

    const { prepared, reconciliation } = await prepare();
    const replacementId = randomUUID();

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { activePlanChangeId: replacementId },
    });

    await apply(prepared, reconciliation);

    assert.equal((await readBilling()).activePlanChangeId, replacementId);
    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("rolls back operation completion when the synchronization baseline is stale", async () => {
    current = subscription("pro", 2);

    const { prepared, reconciliation } = await prepare();
    const newerMarker = new Date(baseline.getTime() + 1);

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { lastSyncedAt: newerMarker },
    });

    await assert.rejects(apply(prepared, reconciliation), {
      code: "BILLING_SYNC_RETRY_REQUIRED",
    });

    assert.equal((await readBilling()).planId, "starter");
    assert.equal((await readBilling()).activePlanChangeId, changeId);
    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("retains the claim when Stripe matches neither source nor target", async () => {
    current = subscription("business");

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation?.outcome, "RECONCILIATION_REQUIRED");
    await apply(prepared, reconciliation);

    assert.equal((await readBilling()).planId, "business");
    assert.equal((await readBilling()).activePlanChangeId, changeId);
    assert.equal((await readChange()).status, "RECONCILIATION_REQUIRED");
  });

  it("rolls back synchronization if the invoice mapping conflicts during application", async () => {
    await mapInvoice();
    current = subscription("pro", 2);

    const { prepared, reconciliation } = await prepare();
    assert.ok(reconciliation);

    await assert.rejects(
      apply(prepared, {
        ...reconciliation,
        stripeInvoiceId: "in_conflicting",
      }),
      { code: "BILLING_PLAN_RECONCILIATION_RETRY_REQUIRED" },
    );

    assert.equal((await readBilling()).planId, "starter");
    assert.equal(
      (await readBilling()).lastSyncedAt?.getTime(),
      baseline.getTime(),
    );
    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("reconciles billing for an archived organization", async () => {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: "ARCHIVED" },
    });

    current = subscription("pro", 2);

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation?.outcome, "APPLIED");
    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "APPLIED");
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("rejects simultaneous plan and capacity operation pointers", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: randomUUID(),
      },
    });

    await assert.rejects(prepare(), {
      code: "BILLING_PLAN_RECONCILIATION_RETRY_REQUIRED",
    });

    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("rejects an event from the wrong Stripe environment", async () => {
    const prepared = await prepareSnapshot();
    const wrongMode = event();
    wrongMode.livemode = true;

    await assert.rejects(
      prepareBillingPlanChangeReconciliation(wrongMode, prepared),
      { code: "BILLING_PLAN_RECONCILIATION_RETRY_REQUIRED" },
    );

    assert.equal((await readChange()).status, "PROCESSING");
  });
});

//************************************************************** */
