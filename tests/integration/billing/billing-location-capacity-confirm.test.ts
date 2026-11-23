
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import Stripe from "stripe";

import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";
import { getStripeClient } from "../../../src/config/stripe.js";

import {
  confirmOrganizationBillingLocationCapacity,
} from "../../../src/modules/billing/billing-location-capacity-confirm.service.js";

describe("Billing location-capacity confirmation", () => {
  let organizationId: string;
  let ownerId: string;
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;
  let locationPriceId: string;
  let current: ReturnType<typeof subscription>;
  let updateAttempts: number;
  let updateKey: string | undefined;

  function price(
    id: string,
    lookupKey: string,
    amount: number,
  ) {
    return {
      id,
      active: true,
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
      product: {
        id: `prod_${id}`,
        active: true,
        livemode: false,
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
        price: price("price_location_pro", "pro-monthly", 29900),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_location_extra",
        quantity,
        current_period_start: start,
        current_period_end: end,
        price: price(
          locationPriceId,
          "pro-additional-location-monthly",
          4000,
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
      pending_update: pending ? { expires_at: end } : null,
      latest_invoice: pending
        ? "in_location_pending"
        : "in_location_paid",
      schedule: null,
      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function confirm() {
    return confirmOrganizationBillingLocationCapacity(
      organizationId,
      ownerId,
      { changeId },
    );
  }

  function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  function readChange() {
    return prisma.billingLocationCapacityChange.findUniqueOrThrow({
      where: { id: changeId },
    });
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    updateAttempts = 0;
    updateKey = undefined;

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Location confirmation ${suffix}`,
        slug: `location-confirm-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await prisma.user.create({
      data: {
        email: `location-confirm-${suffix}@example.com`,
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
    locationPriceId = `price_location_${suffix}`;

    const baseline = new Date(Date.now() - 60000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_location_pro",
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29900,
        lastSyncedAt: baseline,
      },
    });

    const prorationDate = Math.floor(Date.now() / 1000);

    const change = await prisma.billingLocationCapacityChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId: ownerId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedAdditionalLocationQuantity: 0,
        targetAdditionalLocationQuantity: 1,
        expectedLastSyncedAt: baseline,
        prorationDate,
        currency: "usd",
        estimatedAmountDue: 4000n,
        monthlyTotalAmount: 33900n,
        stripeUpdateParameters: {
          items: [{
            price: locationPriceId,
            quantity: 1,
          }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        },
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    changeId = change.id;
    current = subscription();

    const stripe = getStripeClient();

    mock.method(stripe.customers, "retrieve", async () => ({
      id: customerId,
      livemode: false,
      metadata: { organizationId },
    }));

    mock.method(stripe.subscriptions, "retrieve", async () => current);

    mock.method(stripe.subscriptions, "list", async () => ({
      data: [current],
      has_more: false,
    }));

    mock.method(stripe.prices, "list", async () => ({
      data: [
        price(
          locationPriceId,
          "pro-additional-location-monthly",
          4000,
        ),
      ],
      has_more: false,
    }));

    mock.method(
      stripe.subscriptions,
      "update",
      async (
        _id: string,
        _params: Stripe.SubscriptionUpdateParams,
        options: Stripe.RequestOptions,
      ) => {
        updateAttempts += 1;
        updateKey = options.idempotencyKey;
        current = subscription(1);
        return current;
      },
    );
  });

  afterEach(async () => {
    mock.restoreAll();

    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });

    await prisma.user.deleteMany({
      where: { id: ownerId },
    });
  });

  it("applies verified purchased location capacity", async () => {
    const result = await confirm();

    assert.equal(result.status, "APPLIED");
    assert.equal(result.targetLocationLimit, 3);
    assert.equal(result.monthlyTotalAmount, 33900);
    assert.equal(updateAttempts, 1);
    assert.equal(
      updateKey,
      `motodesk:test:location-capacity:${changeId}`,
    );

    const billing = await readBilling();

    assert.equal(billing.additionalLocationQuantity, 1);
    assert.equal(billing.activeLocationCapacityChangeId, null);
    assert.equal((await readChange()).status, "APPLIED");
  });

  it("does not submit twice after successful application", async () => {
    const first = await confirm();
    const second = await confirm();

    assert.deepEqual(second, first);
    assert.equal(updateAttempts, 1);
  });

  it("does not activate capacity while payment is pending", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => {
        updateAttempts += 1;
        current = subscription(0, true);
        return current;
      },
    );

    const result = await confirm();

    assert.equal(result.status, "PENDING_PAYMENT");

    const billing = await readBilling();
    const change = await readChange();

    assert.equal(billing.additionalLocationQuantity, 0);
    assert.equal(billing.activeLocationCapacityChangeId, changeId);
    assert.equal(change.status, "PENDING_PAYMENT");
    assert.equal(change.stripeInvoiceId, "in_location_pending");
  });

  it("does not resubmit a pending-payment purchase", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => {
        updateAttempts += 1;
        current = subscription(0, true);
        return current;
      },
    );

    await confirm();
    const repeated = await confirm();

    assert.equal(repeated.status, "PENDING_PAYMENT");
    assert.equal(updateAttempts, 1);
  });

  it("preserves the claim after an interrupted response", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => {
        updateAttempts += 1;
        throw new Error("Simulated connection failure");
      },
    );

    await assert.rejects(
      confirm(),
      { code: "BILLING_LOCATION_CHANGE_UNCONFIRMED" },
    );

    const billing = await readBilling();
    const change = await readChange();

    assert.equal(billing.additionalLocationQuantity, 0);
    assert.equal(billing.activeLocationCapacityChangeId, changeId);
    assert.equal(change.status, "PROCESSING");
  });

  it("recovers a confirmed purchase after response interruption", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => {
        updateAttempts += 1;
        current = subscription(1);
        throw new Error("Response interrupted after application");
      },
    );

    await assert.rejects(
      confirm(),
      { code: "BILLING_LOCATION_CHANGE_UNCONFIRMED" },
    );

    const recovered = await confirm();

    assert.equal(recovered.status, "APPLIED");
    assert.equal(updateAttempts, 1);
    assert.equal((await readBilling()).additionalLocationQuantity, 1);
  });

  it("rejects modified payment parameters before calling Stripe", async () => {
    await prisma.billingLocationCapacityChange.update({
      where: { id: changeId },
      data: {
        stripeUpdateParameters: {
          items: [{
            price: locationPriceId,
            quantity: 1,
          }],
          payment_behavior: "allow_incomplete",
          proration_behavior: "always_invoice",
        },
      },
    });

    await assert.rejects(
      confirm(),
      { code: "BILLING_LOCATION_PREVIEW_REQUIRED" },
    );

    assert.equal(updateAttempts, 0);
  });
});
