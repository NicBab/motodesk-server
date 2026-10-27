import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import Stripe from "stripe";

import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

import {
  confirmOrganizationBillingUserCapacity,
} from "../../../src/modules/billing/billing-user-capacity-confirm.service.js";

//************************************************************** */

describe("Billing user-capacity confirmation service", () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  let organizationId: string;
  let ownerId: string;
  let ownerMembershipId: string;
  let changeId: string;
  let customerId: string;
  let subscriptionId: string;
  let additionalPriceId: string;

  let updateAttempts: number;
  let current: ReturnType<typeof subscription>;

  let updateRequests: {
    parameters: Stripe.SubscriptionUpdateParams;
    key: string | undefined;
  }[];

  function price(
    id: string,
    lookupKey: string,
    unitAmount: number,
  ) {
    return {
      id,
      active: true,
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

      product: {
        id: `prod_${id}`,
        active: true,
        livemode: false,
      },
    };
  }

  function subscription(quantity = 0, pending = false) {
    const start = Math.floor(Date.now() / 1_000) - 3_600;
    const end = start + 30 * 86_400;

    const items = [
      {
        id: "si_confirm_base",
        quantity: 1,
        current_period_start: start,
        current_period_end: end,
        price: price(
          "price_confirm_pro",
          "pro-monthly",
          29_900,
        ),
      },
    ];

    if (quantity > 0) {
      items.push({
        id: "si_confirm_additional",
        quantity,
        current_period_start: start,
        current_period_end: end,
        price: price(
          additionalPriceId,
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

      latest_invoice: pending
        ? "in_confirm_pending"
        : "in_confirm_paid",

      schedule: null,

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function confirm(
    actorId = ownerId,
    targetOrganizationId = organizationId,
  ) {
    return confirmOrganizationBillingUserCapacity(
      targetOrganizationId,
      actorId,
      { changeId },
    );
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

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    updateAttempts = 0;
    updateRequests = [];

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Capacity confirmation ${suffix}`,
        slug: `capacity-confirmation-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    const owner = await prisma.user.create({
      data: {
        email: `capacity-confirmation-${suffix}@example.com`,
        firstName: "Capacity",
        lastName: "Confirmation",
        emailVerifiedAt: new Date(),
      },
    });

    ownerId = owner.id;
    userIds.push(ownerId);

    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    ownerMembershipId = membership.id;

    customerId = `cus_confirm_${suffix}`;
    subscriptionId = `sub_confirm_${suffix}`;
    additionalPriceId = `price_confirm_additional_${suffix}`;

    const baseline = new Date(Date.now() - 60_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_confirm_pro",
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,
        lastSyncedAt: baseline,
      },
    });

    const prorationDate = Math.floor(Date.now() / 1_000);

    const change = await prisma.billingUserCapacityChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId: ownerId,

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,

        expectedAdditionalUserQuantity: 0,
        targetAdditionalUserQuantity: 2,
        expectedLastSyncedAt: baseline,

        prorationDate,
        currency: "usd",

        estimatedAmountDue: 1_000n,
        monthlyTotalAmount: 31_900n,

        stripeUpdateParameters: {
          items: [{
            price: additionalPriceId,
            quantity: 2,
          }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        },

        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    changeId = change.id;
    current = subscription();

    const stripe = getStripeClient();

    mock.method(
      stripe.customers,
      "retrieve",
      async () => ({
        id: customerId,
        livemode: false,
        metadata: { organizationId },
      }),
    );

    mock.method(
      stripe.subscriptions,
      "retrieve",
      async () => current,
    );

    mock.method(
      stripe.subscriptions,
      "list",
      async () => ({
        data: [current],
        has_more: false,
      }),
    );

    mock.method(
      stripe.prices,
      "list",
      async () => ({
        data: [
          price(
            additionalPriceId,
            "pro-additional-user-monthly",
            1_000,
          ),
        ],
        has_more: false,
      }),
    );

    mock.method(
      stripe.subscriptions,
      "update",
      async (
        _id: string,
        parameters: Stripe.SubscriptionUpdateParams,
        options: Stripe.RequestOptions,
      ) => {
        updateAttempts += 1;

        updateRequests.push({
          parameters,
          key: options.idempotencyKey,
        });

        current = subscription(2);
        return current;
      },
    );
  });

  afterEach(async () => {
    mock.restoreAll();

    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });

    organizationIds.length = 0;
    userIds.length = 0;
  });

  it("submits the stored request and applies verified capacity", async () => {
    const result = await confirm();

    assert.equal(result.status, "APPLIED");
    assert.equal(result.targetUserLimit, 12);
    assert.equal(result.monthlyTotalAmount, 31_900);
    assert.equal(updateAttempts, 1);

    assert.equal(
      updateRequests[0]!.key,
      `motodesk:test:user-capacity:${changeId}`,
    );

    assert.deepEqual(
      updateRequests[0]!.parameters,
      (await readChange()).stripeUpdateParameters,
    );

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activeUserCapacityChangeId, null);
    assert.equal((await readChange()).status, "APPLIED");
  });

  it("returns an applied confirmation without another Stripe update", async () => {
    const first = await confirm();
    const second = await confirm();

    assert.deepEqual(second, first);
    assert.equal(updateAttempts, 1);
  });

  it("records pending payment without granting additional capacity", async () => {
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

    const change = await readChange();
    const billing = await readBilling();

    assert.equal(change.status, "PENDING_PAYMENT");
    assert.equal(change.stripeInvoiceId, "in_confirm_pending");

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, changeId);
  });

  it("does not resubmit a known pending-payment operation", async () => {
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
    assert.equal((await readBilling()).additionalUserQuantity, 0);
  });

  it("retains an uncertain operation after an interrupted response", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => {
        updateAttempts += 1;
        throw new Error("Simulated interrupted response.");
      },
    );

    await assert.rejects(
      confirm(),
      { code: "BILLING_CAPACITY_CHANGE_UNCONFIRMED" },
    );

    const change = await readChange();
    const billing = await readBilling();

    assert.equal(change.status, "PROCESSING");
    assert.equal(
      change.lastErrorCode,
      "BILLING_CAPACITY_CHANGE_UNCONFIRMED",
    );

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, changeId);
  });

  it("recovers an applied Stripe change after its response was interrupted", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => {
        updateAttempts += 1;
        current = subscription(2);

        throw new Error("Response interrupted after application.");
      },
    );

    await assert.rejects(
      confirm(),
      { code: "BILLING_CAPACITY_CHANGE_UNCONFIRMED" },
    );

    assert.equal((await readBilling()).additionalUserQuantity, 0);

    const recovered = await confirm();

    assert.equal(recovered.status, "APPLIED");
    assert.equal(updateAttempts, 1);

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activeUserCapacityChangeId, null);
  });

  it("releases a definitively rejected request", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => {
        throw new Stripe.errors.StripeInvalidRequestError({
          type: "invalid_request_error",
          statusCode: 400,
          message: "Private configuration details.",
        });
      },
    );

    await assert.rejects(
      confirm(),
      { code: "BILLING_CAPACITY_CHANGE_REJECTED" },
    );

    assert.equal((await readChange()).status, "REJECTED");

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, null);
  });

  it("retains the claim after a Stripe server error", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "update",
      async () => {
        throw new Stripe.errors.StripeAPIError({
          type: "api_error",
          statusCode: 500,
          message: "Private provider failure.",
        });
      },
    );

    await assert.rejects(
      confirm(),
      { code: "BILLING_CAPACITY_CHANGE_UNCONFIRMED" },
    );

    assert.equal((await readChange()).status, "PROCESSING");

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      changeId,
    );
  });

  it("rechecks current billing-update permission", async () => {
    await prisma.membership.update({
      where: { id: ownerMembershipId },
      data: { role: "TECHNICIAN" },
    });

    await assert.rejects(
      confirm(),
      { code: "INSUFFICIENT_PERMISSIONS" },
    );

    assert.equal(updateAttempts, 0);
    assert.equal((await readChange()).status, "QUOTED");
  });

  it("rejects confirmation through another organization", async () => {
    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Other confirmation ${suffix}`,
        slug: `other-confirmation-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    await assert.rejects(
      confirm(ownerId, other.id),
      { code: "ORGANIZATION_NOT_FOUND" },
    );

    assert.equal(updateAttempts, 0);
  });

  it("rejects an expired preview without submitting an update", async () => {
    await prisma.billingUserCapacityChange.update({
      where: { id: changeId },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await assert.rejects(
      confirm(),
      { code: "BILLING_CAPACITY_PREVIEW_EXPIRED" },
    );

    assert.equal(updateAttempts, 0);

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      null,
    );
  });

  it("rejects a subscription canceled after the preview", async () => {
    current.cancel_at_period_end = true;

    await assert.rejects(
      confirm(),
      { code: "BILLING_CAPACITY_STATE_CHANGED" },
    );

    assert.equal(updateAttempts, 0);
    assert.equal((await readChange()).status, "QUOTED");
  });

  it("rejects altered stored payment parameters", async () => {
    await prisma.billingUserCapacityChange.update({
      where: { id: changeId },
      data: {
        stripeUpdateParameters: {
          items: [{
            price: additionalPriceId,
            quantity: 2,
          }],
          payment_behavior: "allow_incomplete",
          proration_behavior: "always_invoice",
          proration_date: Math.floor(Date.now() / 1_000),
        },
      },
    });

    await assert.rejects(
      confirm(),
      { code: "BILLING_CAPACITY_PREVIEW_REQUIRED" },
    );

    assert.equal(updateAttempts, 0);
  });

  it("rejects a reduction below current membership usage", async () => {
    current = subscription(2);

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: additionalPriceId,
        stripeAdditionalUserItemId: "si_confirm_additional",
      },
    });

    const change = await readChange();

    await prisma.billingUserCapacityChange.update({
      where: { id: changeId },
      data: {
        expectedAdditionalUserQuantity: 2,
        targetAdditionalUserQuantity: 0,
        monthlyTotalAmount: 29_900n,

        stripeUpdateParameters: {
          items: [{
            id: "si_confirm_additional",
            deleted: true,
          }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: change.prorationDate,
        },
      },
    });

    // Owner plus ten members uses eleven slots.
    for (let index = 0; index < 10; index += 1) {
      const user = await prisma.user.create({
        data: {
          email: `confirm-usage-${randomUUID()}@example.com`,
          firstName: "Usage",
          lastName: "Member",
        },
      });

      userIds.push(user.id);

      await prisma.membership.create({
        data: {
          organizationId,
          userId: user.id,
          role: "TECHNICIAN",
          status: "ACTIVE",
        },
      });
    }

    await assert.rejects(
      confirm(),
      { code: "BILLING_CAPACITY_BELOW_USAGE" },
    );

    assert.equal(updateAttempts, 0);

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activeUserCapacityChangeId, null);
  });
});

//************************************************************** */