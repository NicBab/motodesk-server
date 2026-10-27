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
  previewOrganizationBillingUserCapacity,
} from "../../../src/modules/billing/billing-user-capacity-preview.service.js";

//************************************************************** */

describe("Billing user-capacity preview service", () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  let organizationId: string;
  let ownerId: string;
  let customerId: string;
  let subscriptionId: string;
  let additionalPriceId: string;

  let stripeReads: number;
  let priceReads: number;
  let updateAttempts: number;

  let invoiceRequests: Stripe.InvoiceCreatePreviewParams[];

  function makePrice(
    lookupKey: string,
    unitAmount: number,
    id: string,
  ) {
    return {
      id,
      object: "price",
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

  function subscription(
    status = "active",
    additionalQuantity = 0,
  ) {
    const start = Math.floor(Date.now() / 1_000) - 3_600;
    const end = start + 14 * 86_400;

    const items = [
      {
        id: "si_preview_base",
        quantity: 1,
        current_period_start: start,
        current_period_end: end,
        price: makePrice(
          "pro-monthly",
          29_900,
          "price_preview_base",
        ),
      },
    ];

    if (additionalQuantity > 0) {
      items.push({
        id: "si_preview_additional",
        quantity: additionalQuantity,
        current_period_start: start,
        current_period_end: end,
        price: makePrice(
          "pro-additional-user-monthly",
          1_000,
          additionalPriceId,
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
      status,

      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,

      trial_start: status === "trialing" ? start : null,
      trial_end: status === "trialing" ? end : null,

      pending_update: null,
      schedule: null,

      items: {
        has_more: false,
        data: items,
      },
    };
  }

  function preview(
    quantity = 2,
    actorId = ownerId,
    targetOrganizationId = organizationId,
  ) {
    return previewOrganizationBillingUserCapacity(
      targetOrganizationId,
      actorId,
      { additionalUserQuantity: quantity },
    );
  }

  function quoteCount() {
    return prisma.billingUserCapacityChange.count({
      where: {
        organizationBilling: { organizationId },
      },
    });
  }

  async function useExistingAdditionalUsers(quantity = 2) {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        additionalUserQuantity: quantity,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: additionalPriceId,
        stripeAdditionalUserItemId: "si_preview_additional",
      },
    });

    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => subscription("active", quantity),
    );
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");
    assert.ok(env.STRIPE_WEBHOOK_SECRET);

    stripeReads = 0;
    priceReads = 0;
    updateAttempts = 0;
    invoiceRequests = [];

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Capacity preview ${suffix}`,
        slug: `capacity-preview-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    const owner = await prisma.user.create({
      data: {
        email: `capacity-preview-${suffix}@example.com`,
        firstName: "Capacity",
        lastName: "Preview",
        emailVerifiedAt: new Date(),
      },
    });

    ownerId = owner.id;
    userIds.push(ownerId);

    await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    customerId = `cus_preview_${suffix}`;
    subscriptionId = `sub_preview_${suffix}`;
    additionalPriceId = `price_additional_${suffix}`;

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_preview_base",
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,
        lastSyncedAt: new Date(Date.now() - 60_000),
      },
    });

    const stripe = getStripeClient();

    mock.method(
      stripe.customers,
      "retrieve",
      async () => {
        stripeReads += 1;

        return {
          id: customerId,
          object: "customer",
          livemode: false,
          metadata: { organizationId },
        };
      },
    );

    mock.method(
      stripe.subscriptions,
      "retrieve",
      async () => subscription(),
    );

    mock.method(
      stripe.subscriptions,
      "update",
      async () => {
        updateAttempts += 1;
        throw new Error("Preview must not update subscriptions.");
      },
    );

    mock.method(
      stripe.prices,
      "list",
      async () => {
        priceReads += 1;

        return {
          object: "list",
          has_more: false,
          data: [
            makePrice(
              "pro-additional-user-monthly",
              1_000,
              additionalPriceId,
            ),
          ],
        };
      },
    );

    mock.method(
      stripe.invoices,
      "createPreview",
      async (input: Stripe.InvoiceCreatePreviewParams) => {
        invoiceRequests.push(input);

        return {
          id: "upcoming_preview_test",
          object: "invoice",
          customer: customerId,
          livemode: false,
          currency: "usd",
          amount_due: 500,
        };
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

  it("previews first-time additional users without updating the subscription", async () => {
    const result = await preview(2);

    assert.equal(result.currentUserLimit, 10);
    assert.equal(result.targetUserLimit, 12);
    assert.equal(result.additionalUserUnitAmount, 1_000);
    assert.equal(result.monthlyTotalAmount, 31_900);
    assert.equal(result.estimatedInvoiceAmountDue, 500);
    assert.equal(result.invoiceEstimateScope, "next_invoice");

    assert.equal(priceReads, 1);
    assert.equal(updateAttempts, 0);
    assert.equal(invoiceRequests.length, 1);

    assert.deepEqual(
      invoiceRequests[0]!.subscription_details?.items,
      [{ price: additionalPriceId, quantity: 2 }],
    );

    const change =
      await prisma.billingUserCapacityChange.findUniqueOrThrow({
        where: { id: result.changeId },
      });

    assert.equal(change.status, "QUOTED");
    assert.equal(change.targetAdditionalUserQuantity, 2);
    assert.equal(change.monthlyTotalAmount, 31_900n);
    assert.equal(change.estimatedAmountDue, 500n);
    assert.equal(change.submittedAt, null);

    assert.deepEqual(change.stripeUpdateParameters, {
      items: [{ price: additionalPriceId, quantity: 2 }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      proration_date: change.prorationDate,
    });

    assert.equal(
      invoiceRequests[0]!.subscription_details?.proration_date,
      change.prorationDate,
    );

    const billing =
      await prisma.organizationBilling.findUniqueOrThrow({
        where: { organizationId },
      });

    assert.equal(billing.additionalUserQuantity, 0);
    assert.equal(billing.activeUserCapacityChangeId, null);

    const serialized = JSON.stringify(result);

    assert.equal(serialized.includes(customerId), false);
    assert.equal(serialized.includes(subscriptionId), false);
    assert.equal(serialized.includes(additionalPriceId), false);
  });

  it("preserves the trial and disables immediate prorations", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { status: "TRIALING" },
    });

    const trial = subscription("trialing");

    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => trial,
    );

    const result = await preview();

    assert.equal(
      result.trialEndsAt,
      new Date(trial.trial_end! * 1_000).toISOString(),
    );

    const change =
      await prisma.billingUserCapacityChange.findUniqueOrThrow({
        where: { id: result.changeId },
      });

    assert.deepEqual(change.stripeUpdateParameters, {
      items: [{ price: additionalPriceId, quantity: 2 }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "none",
    });

    assert.equal(
      invoiceRequests[0]!.subscription_details?.proration_behavior,
      "none",
    );
    assert.equal(
      invoiceRequests[0]!.subscription_details?.proration_date,
      undefined,
    );
    assert.equal(updateAttempts, 0);
  });

  it("updates an existing additional-user item rather than adding another", async () => {
    await useExistingAdditionalUsers(2);

    const result = await preview(3);

    assert.equal(result.currentUserLimit, 12);
    assert.equal(result.targetUserLimit, 13);
    assert.equal(result.monthlyTotalAmount, 32_900);
    assert.equal(priceReads, 0);

    assert.deepEqual(
      invoiceRequests[0]!.subscription_details?.items,
      [{ id: "si_preview_additional", quantity: 3 }],
    );
  });

  it("previews removing the additional-user item when the target is zero", async () => {
    await useExistingAdditionalUsers(2);

    const result = await preview(0);

    assert.equal(result.targetUserLimit, 10);
    assert.equal(result.monthlyTotalAmount, 29_900);

    assert.deepEqual(
      invoiceRequests[0]!.subscription_details?.items,
      [{ id: "si_preview_additional", deleted: true }],
    );

    assert.equal(updateAttempts, 0);
  });

  it("requires a Pro subscription before contacting Stripe", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        planId: "starter",
        unitAmount: 8_900,
      },
    });

    await assert.rejects(
      preview(),
      { code: "BILLING_PRO_SUBSCRIPTION_REQUIRED" },
    );

    assert.equal(stripeReads, 0);
    assert.equal(await quoteCount(), 0);
  });

  it("does not sell additional users to an exempt organization", async () => {
    await prisma.platformAdmin.create({
      data: {
        userId: ownerId,
        role: "SUPER_ADMIN",
        billingExempt: true,
      },
    });

    await assert.rejects(
      preview(),
      { code: "BILLING_EXEMPT" },
    );

    assert.equal(stripeReads, 0);
    assert.equal(await quoteCount(), 0);
  });

  it("rejects an unchanged quantity before contacting Stripe", async () => {
    await assert.rejects(
      preview(0),
      { code: "BILLING_CAPACITY_UNCHANGED" },
    );

    assert.equal(stripeReads, 0);
    assert.equal(await quoteCount(), 0);
  });

  it("requires billing-update permission", async () => {
    const member = await prisma.user.create({
      data: {
        email: `preview-member-${randomUUID()}@example.com`,
        firstName: "Preview",
        lastName: "Member",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(member.id);

    await prisma.membership.create({
      data: {
        organizationId,
        userId: member.id,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });

    await assert.rejects(
      preview(2, member.id),
      { code: "INSUFFICIENT_PERMISSIONS" },
    );

    assert.equal(stripeReads, 0);
  });

  it("rejects access to another organization's preview service", async () => {
    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Foreign preview ${suffix}`,
        slug: `foreign-preview-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    await assert.rejects(
      preview(2, ownerId, other.id),
      { code: "ORGANIZATION_NOT_FOUND" },
    );

    assert.equal(stripeReads, 0);
  });

  it("rejects a customer with mismatched tenant metadata", async () => {
    mock.method(
      getStripeClient().customers,
      "retrieve",
      async () => ({
        id: customerId,
        livemode: false,
        metadata: { organizationId: "another-organization" },
      }),
    );

    await assert.rejects(
      preview(),
      { code: "BILLING_CUSTOMER_MAPPING_INVALID" },
    );

    assert.equal(await quoteCount(), 0);
  });

  it("blocks previews while a Stripe pending update exists", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => ({
        ...subscription(),
        pending_update: {
          expires_at: Math.floor(Date.now() / 1_000) + 3_600,
        },
      }),
    );

    await assert.rejects(
      preview(),
      { code: "BILLING_SUBSCRIPTION_CHANGE_PENDING" },
    );

    assert.equal(invoiceRequests.length, 0);
    assert.equal(await quoteCount(), 0);
  });

  it("requires scheduled cancellation to be undone first", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "retrieve",
      async () => ({
        ...subscription(),
        cancel_at_period_end: true,
      }),
    );

    await assert.rejects(
      preview(),
      { code: "BILLING_CANCELLATION_SCHEDULED" },
    );

    assert.equal(await quoteCount(), 0);
  });

  it("rejects an invoice preview with an unexpected currency", async () => {
    mock.method(
      getStripeClient().invoices,
      "createPreview",
      async () => ({
        customer: customerId,
        livemode: false,
        currency: "eur",
        amount_due: 500,
      }),
    );

    await assert.rejects(
      preview(),
      { code: "BILLING_CAPACITY_PREVIEW_INVALID" },
    );

    assert.equal(await quoteCount(), 0);
  });

  it("sanitizes provider failures without creating a quote", async () => {
    mock.method(
      getStripeClient().invoices,
      "createPreview",
      async () => {
        throw new Error("Private provider request details.");
      },
    );

    await assert.rejects(
      preview(),
      (error: unknown) => {
        assert.ok(error instanceof Error);

        assert.equal(
          "code" in error ? error.code : undefined,
          "BILLING_CAPACITY_PREVIEW_UNAVAILABLE",
        );

        assert.equal(
          error.message.includes("Private provider"),
          false,
        );

        return true;
      },
    );

    assert.equal(await quoteCount(), 0);
    assert.equal(updateAttempts, 0);
  });

  it("rejects an invalid quantity before contacting Stripe", async () => {
    await assert.rejects(
      preview(-1),
      { code: "BILLING_CAPACITY_QUANTITY_INVALID" },
    );

    assert.equal(stripeReads, 0);
    assert.equal(await quoteCount(), 0);
  });
});

//************************************************************** */