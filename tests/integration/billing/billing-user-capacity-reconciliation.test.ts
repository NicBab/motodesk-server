import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import type Stripe from "stripe";

import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

import {
  prepareBillingSynchronization,
  type PreparedBillingSynchronization,
} from "../../../src/modules/billing/billing-sync.service.js";

import {
  applyBillingUserCapacityReconciliation,
  prepareBillingUserCapacityReconciliation,
  type PreparedUserCapacityReconciliation,
} from "../../../src/modules/billing/billing-user-capacity-reconciliation.service.js";

//************************************************************** */

describe("Billing user-capacity webhook reconciliation", () => {
  let organizationId: string;
  let ownerId: string;
  let billingId: string;
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;
  let baseline: Date;

  let current: ReturnType<typeof subscription>;

  function price(
    id: string,
    lookupKey: string,
    unitAmount: number,
  ) {
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

  function subscription(quantity = 0, pending = false) {
    const start = Math.floor(Date.now() / 1_000) - 3_600;
    const end = start + 30 * 86_400;

    const items = [
      {
        id: "si_reconciliation_base",
        quantity: 1,
        current_period_start: start,
        current_period_end: end,
        price: price(
          "price_reconciliation_base",
          "pro-monthly",
          29_900,
        ),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_reconciliation_additional",
        quantity,
        current_period_start: start,
        current_period_end: end,
        price: price(
          "price_reconciliation_additional",
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
      created: start,

      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_start: null,
      trial_end: null,

      pending_update: pending
        ? { expires_at: end }
        : null,

      latest_invoice: "in_reconciliation_pending",

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function event(matchesOperation = false): Stripe.Event {
    // Fixture includes only fields consumed by reconciliation.
    return {
      id: `evt_${randomUUID()}`,
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1_000),
      livemode: false,

      request: {
        id: `req_${randomUUID()}`,
        idempotency_key: matchesOperation
          ? `motodesk:test:user-capacity:${changeId}`
          : "another-operation",
      },

      data: {
        object: current,
      },
    } as unknown as Stripe.Event;
  }

  async function prepareSnapshot() {
    const prepared = await prepareBillingSynchronization(
      customerId,
    );

    assert.ok(prepared);

    return prepared;
  }

  async function prepare(matchesOperation = false) {
    const prepared = await prepareSnapshot();

    const reconciliation =
      await prepareBillingUserCapacityReconciliation(
        event(matchesOperation),
        prepared,
      );

    return { prepared, reconciliation };
  }

  function apply(
    prepared: PreparedBillingSynchronization,
    reconciliation: PreparedUserCapacityReconciliation | null,
  ) {
    return prisma.$transaction(async (transaction) => {
      await applyBillingUserCapacityReconciliation(
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
    return prisma.billingUserCapacityChange.findUniqueOrThrow({
      where: { id: changeId },
    });
  }

  function mapInvoice() {
    return prisma.billingUserCapacityChange.update({
      where: { id: changeId },
      data: {
        stripeInvoiceId: "in_reconciliation_pending",
      },
    });
  }

  beforeEach(async () => {
    organizationId = "";
    ownerId = "";

    assert.equal(env.STRIPE_MODE, "test");

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Capacity reconciliation ${suffix}`,
        slug: `capacity-reconciliation-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await prisma.user.create({
      data: {
        email: `capacity-reconciliation-${suffix}@example.com`,
        firstName: "Capacity",
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

    customerId = `cus_reconciliation_${suffix}`;
    subscriptionId = `sub_reconciliation_${suffix}`;
    baseline = new Date(Date.now() - 60_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_reconciliation_base",
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,
        lastSyncedAt: baseline,
      },
    });

    billingId = billing.id;

    const change = await prisma.billingUserCapacityChange.create({
      data: {
        organizationBillingId: billingId,
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
          items: [{
            price: "price_reconciliation_additional",
            quantity: 2,
          }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
        },

        expiresAt: new Date(Date.now() + 600_000),
        submittedAt: new Date(Date.now() - 30_000),
      },
    });

    changeId = change.id;

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: changeId,
      },
    });

    current = subscription();

    const stripe = getStripeClient();

    mock.method(
      stripe.subscriptions,
      "list",
      async () => ({
        data: [current],
        has_more: false,
      }),
    );

    mock.method(
      stripe.subscriptions,
      "retrieve",
      async () => current,
    );

    mock.method(
      stripe.invoices,
      "retrieve",
      async () => ({
        id: "in_reconciliation_pending",
        customer: customerId,
        livemode: false,
        status: "void",
      }),
    );
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

  it("applies current Stripe capacity and completes its operation", async () => {
    current = subscription(2);

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation?.outcome, "APPLIED");

    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "APPLIED");
    assert.ok((await readChange()).appliedAt);

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activeUserCapacityChangeId, null);
  });

  it("preserves pending payment without granting capacity", async () => {
    await mapInvoice();
    current = subscription(0, true);

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation?.outcome, "PENDING_PAYMENT");

    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "PENDING_PAYMENT");
    assert.equal((await readBilling()).additionalUserQuantity, 0);

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      changeId,
    );
  });

  it("recovers a missing invoice mapping from the exact operation's event", async () => {
    current = subscription(0, true);

    const { prepared, reconciliation } = await prepare(true);

    assert.equal(reconciliation?.outcome, "PENDING_PAYMENT");

    await apply(prepared, reconciliation);

    const change = await readChange();

    assert.equal(change.status, "PENDING_PAYMENT");
    assert.equal(
      change.stripeInvoiceId,
      "in_reconciliation_pending",
    );
    assert.equal((await readBilling()).additionalUserQuantity, 0);
  });

  it("does not attribute an unidentified pending update to this operation", async () => {
    current = subscription(0, true);

    const { prepared, reconciliation } = await prepare(false);

    assert.equal(reconciliation, null);

    await apply(prepared, reconciliation);

    const change = await readChange();

    assert.equal(change.status, "PROCESSING");
    assert.equal(change.stripeInvoiceId, null);

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      changeId,
    );
  });

  it("releases an unapplied operation after its mapped invoice is void", async () => {
    await mapInvoice();

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation?.outcome, "EXPIRED");

    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "EXPIRED");

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, null);
  });

  it("does not release an operation while its invoice remains payable", async () => {
    await mapInvoice();

    mock.method(
      getStripeClient().invoices,
      "retrieve",
      async () => ({
        id: "in_reconciliation_pending",
        customer: customerId,
        livemode: false,
        status: "open",
      }),
    );

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation, null);

    await apply(prepared, reconciliation);

    assert.equal((await readChange()).status, "PROCESSING");

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      changeId,
    );
  });

  it("rejects an invoice belonging to another customer", async () => {
    await mapInvoice();

    mock.method(
      getStripeClient().invoices,
      "retrieve",
      async () => ({
        id: "in_reconciliation_pending",
        customer: "cus_other",
        livemode: false,
        status: "void",
      }),
    );

    await assert.rejects(
      prepare(),
      {
        code: "BILLING_CAPACITY_RECONCILIATION_RETRY_REQUIRED",
      },
    );

    assert.equal((await readChange()).status, "PROCESSING");

    assert.equal(
      (await readBilling()).lastSyncedAt?.getTime(),
      baseline.getTime(),
    );
  });

  it("retries when Stripe changes between synchronization reads", async () => {
    const prepared = await prepareSnapshot();

    current = subscription(2);

    await assert.rejects(
      prepareBillingUserCapacityReconciliation(
        event(),
        prepared,
      ),
      {
        code: "BILLING_CAPACITY_RECONCILIATION_RETRY_REQUIRED",
      },
    );

    assert.equal((await readBilling()).additionalUserQuantity, 0);
  });

  it("preserves a different operation claim created after preparation", async () => {
    current = subscription(2);

    const { prepared, reconciliation } = await prepare();

    assert.equal(reconciliation?.outcome, "APPLIED");

    const original = await readChange();

    const replacement =
      await prisma.billingUserCapacityChange.create({
        data: {
          organizationBillingId: billingId,
          requestedByUserId: ownerId,
          status: "PROCESSING",

          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,

          expectedAdditionalUserQuantity: 2,
          targetAdditionalUserQuantity: 3,

          prorationDate: original.prorationDate,
          currency: "usd",
          estimatedAmountDue: 500n,
          monthlyTotalAmount: 32_900n,

          stripeUpdateParameters: {},
          expiresAt: original.expiresAt,
          submittedAt: new Date(),
        },
      });

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: replacement.id,
      },
    });

    await apply(prepared, reconciliation);

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      replacement.id,
    );

    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("rolls back operation completion when its snapshot baseline is stale", async () => {
    current = subscription(2);

    const { prepared, reconciliation } = await prepare();
    const newerMarker = new Date(baseline.getTime() + 1);

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        lastSyncedAt: newerMarker,
      },
    });

    await assert.rejects(
      apply(prepared, reconciliation),
      { code: "BILLING_SYNC_RETRY_REQUIRED" },
    );

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, changeId);
    assert.equal((await readChange()).status, "PROCESSING");
  });

  it("retains the claim for an unexpected actual Stripe quantity", async () => {
    current = subscription(3);

    const { prepared, reconciliation } = await prepare();

    assert.equal(
      reconciliation?.outcome,
      "RECONCILIATION_REQUIRED",
    );

    await apply(prepared, reconciliation);

    const billing = await readBilling();
    const change = await readChange();

    assert.equal(billing.additionalUserQuantity, 3);
    assert.equal(billing.activeUserCapacityChangeId, changeId);

    assert.equal(change.status, "RECONCILIATION_REQUIRED");
    assert.equal(
      change.lastErrorCode,
      "BILLING_CAPACITY_RECONCILIATION_REQUIRED",
    );
  });
});

//************************************************************** */