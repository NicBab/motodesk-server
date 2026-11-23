import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type Stripe from "stripe";

import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";
import { getStripeClient } from "../../../src/config/stripe.js";
import {
  prepareBillingSynchronization,
  applyBillingSynchronization,
} from "../../../src/modules/billing/billing-sync.service.js";
import {
  prepareBillingLocationCapacityReconciliation,
  applyBillingLocationCapacityReconciliation,
} from "../../../src/modules/billing/billing-location-capacity-reconciliation.service.js";

describe("Billing location-capacity reconciliation", () => {
  let organizationId = "";
  let ownerId = "";
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;
  let current: ReturnType<typeof subscription>;

  let invoiceStatus = "paid";
  let invoiceCustomer: string;
  let invoiceSubscription: string;

  const invoiceId = "in_location_reconciliation";

  function price(id: string, lookupKey: string, amount: number) {
    return {
      id,
      lookup_key: lookupKey,
      livemode: false,
      type: "recurring",
      billing_scheme: "per_unit",
      currency: "usd",
      unit_amount: amount,
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
    const start = Math.floor(Date.now() / 1000) - 3600;
    const end = start + 30 * 86400;

    const items = [
      {
        id: "si_location_base",
        quantity: 1,
        current_period_start: start,
        current_period_end: end,
        price: price("price_location_base", "pro-monthly", 29900),
      },
      ...(quantity > 0
        ? [{
            id: "si_location_additional",
            quantity,
            current_period_start: start,
            current_period_end: end,
            price: price(
              "price_location_additional",
              "pro-additional-location-monthly",
              4000,
            ),
          }]
        : []),
    ];

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
      pending_update: pending ? { expires_at: end } : null,
      latest_invoice: invoiceId,
      schedule: null,
      items: { data: items, has_more: false },
    };
  }

  function event(correlated = true): Stripe.Event {
    return {
      id: `evt_${randomUUID()}`,
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      request: {
        id: `req_${randomUUID()}`,
        idempotency_key: correlated
          ? `motodesk:test:location-capacity:${changeId}`
          : "unrelated-operation",
      },
      data: { object: current },
    } as unknown as Stripe.Event;
  }

  async function reconcile(correlated = true) {
    const prepared = await prepareBillingSynchronization(customerId);
    assert.ok(prepared);

    return prepareBillingLocationCapacityReconciliation(
      event(correlated),
      prepared,
    );
  }

  async function reconcileAndApply() {
    const prepared = await prepareBillingSynchronization(customerId);
    assert.ok(prepared);

    const reconciliation =
      await prepareBillingLocationCapacityReconciliation(event(), prepared);

    await prisma.$transaction(async (transaction) => {
      await applyBillingSynchronization(transaction, prepared);
      await applyBillingLocationCapacityReconciliation(
        transaction,
        prepared,
        reconciliation,
      );
    });

    const billing = await prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
    const change = await prisma.billingLocationCapacityChange.findUniqueOrThrow({
      where: { id: changeId },
    });

    return { billing, change };
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Location reconciliation ${suffix}`,
        slug: `location-reconciliation-${suffix}`,
      },
    });
    organizationId = organization.id;

    const owner = await prisma.user.create({
      data: {
        email: `location-reconciliation-${suffix}@example.com`,
        firstName: "Location",
        lastName: "Owner",
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

    customerId = `cus_location_${suffix}`;
    subscriptionId = `sub_location_${suffix}`;

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_location_base",
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29900,
        lastSyncedAt: new Date(Date.now() - 60000),
      },
    });

    const change = await prisma.billingLocationCapacityChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId: ownerId,
        status: "PROCESSING",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedAdditionalLocationQuantity: 0,
        targetAdditionalLocationQuantity: 1,
        expectedLastSyncedAt: billing.lastSyncedAt,
        prorationDate: Math.floor(Date.now() / 1000),
        currency: "usd",
        estimatedAmountDue: 4000n,
        monthlyTotalAmount: 33900n,
        stripeUpdateParameters: {
          items: [{ price: "price_location_additional", quantity: 1 }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
        },
        expiresAt: new Date(Date.now() + 600000),
        submittedAt: new Date(),
      },
    });
    changeId = change.id;

    await prisma.organizationBilling.update({
      where: { id: billing.id },
      data: { activeLocationCapacityChangeId: changeId },
    });

    current = subscription();
    invoiceStatus = "paid";
    invoiceCustomer = customerId;
    invoiceSubscription = subscriptionId;

    const stripe = getStripeClient();
    mock.method(stripe.subscriptions, "list", async () => ({
      data: [current],
      has_more: false,
    }));
    mock.method(stripe.subscriptions, "retrieve", async () => current);
    mock.method(stripe.invoices, "retrieve", async () => ({
      id: invoiceId,
      customer: invoiceCustomer,
      livemode: false,
      status: invoiceStatus,
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: invoiceSubscription },
      },
    }));
  });

  afterEach(async () => {
    mock.restoreAll();
    if (organizationId) {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (ownerId) {
      await prisma.user.deleteMany({ where: { id: ownerId } });
    }
  });

  it("recognizes a paid, correlated location purchase", async () => {
    current = subscription(1);
    const result = await reconcile();
    assert.equal(result?.outcome, "APPLIED");
    assert.equal(result?.changeId, changeId);
    assert.equal(result?.stripeInvoiceId, invoiceId);
  });

  it("does not apply a purchase with an unpaid invoice", async () => {
    current = subscription(1);
    invoiceStatus = "open";
    await assert.rejects(reconcile(), {
      code: "BILLING_LOCATION_RECONCILIATION_RETRY_REQUIRED",
    });
  });

  it("rejects an invoice belonging to another subscription", async () => {
    current = subscription(1);
    invoiceSubscription = "sub_unrelated";
    await assert.rejects(reconcile(), {
      code: "BILLING_LOCATION_RECONCILIATION_RETRY_REQUIRED",
    });
  });

  it("rejects an invoice belonging to another customer", async () => {
    current = subscription(1);
    invoiceCustomer = "cus_unrelated";
    await assert.rejects(reconcile(), {
      code: "BILLING_LOCATION_RECONCILIATION_RETRY_REQUIRED",
    });
  });

  it("does not attribute an unrelated event to the purchase", async () => {
    current = subscription(1);
    await assert.rejects(reconcile(false), {
      code: "BILLING_LOCATION_RECONCILIATION_RETRY_REQUIRED",
    });
  });

  it("recognizes a correlated pending payment without applying capacity", async () => {
    current = subscription(0, true);
    const result = await reconcile();
    assert.equal(result?.outcome, "PENDING_PAYMENT");
    assert.equal(result?.stripeInvoiceId, invoiceId);
  });

  it("atomically applies purchased capacity and releases the claim", async () => {
    current = subscription(1);
    const { billing, change } = await reconcileAndApply();
    assert.equal(billing.additionalLocationQuantity, 1);
    assert.equal(billing.activeLocationCapacityChangeId, null);
    assert.equal(change.status, "APPLIED");
    assert.ok(change.appliedAt);
    assert.equal(change.stripeInvoiceId, invoiceId);
  });

  it("preserves the purchase claim while payment is pending", async () => {
    current = subscription(0, true);
    const { billing, change } = await reconcileAndApply();
    assert.equal(billing.additionalLocationQuantity, 0);
    assert.equal(billing.activeLocationCapacityChangeId, changeId);
    assert.equal(change.status, "PENDING_PAYMENT");
    assert.equal(change.stripeInvoiceId, invoiceId);
    assert.equal(change.appliedAt, null);
  });

  it("does not apply capacity when invoice validation fails", async () => {
    current = subscription(1);
    invoiceStatus = "open";
    await assert.rejects(reconcileAndApply(), {
      code: "BILLING_LOCATION_RECONCILIATION_RETRY_REQUIRED",
    });
    const billing = await prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
    const change = await prisma.billingLocationCapacityChange.findUniqueOrThrow({
      where: { id: changeId },
    });
    assert.equal(billing.additionalLocationQuantity, 0);
    assert.equal(billing.activeLocationCapacityChangeId, changeId);
    assert.equal(change.status, "PROCESSING");
  });
});
