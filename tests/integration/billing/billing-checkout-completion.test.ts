import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import { env } from "../../../src/config/env.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

import {
  applyBillingSynchronization,
  prepareBillingSynchronization,
  type PreparedBillingSynchronization,
} from "../../../src/modules/billing/billing-sync.service.js";

import {
  claimOrganizationCheckout,
} from "../../../src/modules/billing/billing-checkout.repository.js";

//************************************************************** */

describe("Completed billing checkout cleanup", () => {
  let organizationId: string;
  let customerId: string;
  let subscriptionId: string;
  let operationId: string;
  let sessionId: string;

  function subscription(
    status = "trialing",
    checkoutOperationId = operationId,
  ) {
    return {
      id: subscriptionId,
      object: "subscription",
      customer: customerId,
      livemode: false,

      metadata: {
        organizationId,
        checkoutOperationId,
      },

      collection_method: "charge_automatically",
      currency: "usd",
      status,
      created: 1_767_225_600,

      cancel_at_period_end: false,
      cancel_at: null,

      canceled_at:
        status === "canceled" ? 1_768_435_200 : null,

      ended_at:
        status === "canceled" ? 1_768_435_200 : null,

      trial_start: 1_767_225_600,
      trial_end: 1_768_435_200,

      items: {
        has_more: false,

        data: [
          {
            id: `si_${subscriptionId}`,
            quantity: 1,
            current_period_start: 1_767_225_600,
            current_period_end: 1_768_435_200,

            price: {
              id: `price_${subscriptionId}`,
              lookup_key: "starter-monthly",
              livemode: false,
              type: "recurring",
              billing_scheme: "per_unit",
              currency: "usd",
              unit_amount: 8_900,
              transform_quantity: null,
              custom_unit_amount: null,

              recurring: {
                interval: "month",
                interval_count: 1,
                usage_type: "licensed",
              },
            },
          },
        ],
      },
    };
  }

  function session(
    status = "complete",
    linkedSubscriptionId: string | null = subscriptionId,
  ) {
    return {
      id: sessionId,
      object: "checkout.session",
      mode: "subscription",
      status,
      livemode: false,

      customer: customerId,
      subscription: linkedSubscriptionId,
      client_reference_id: organizationId,

      metadata: {
        organizationId,
        checkoutOperationId: operationId,
        planId: "starter",
      },

      expires_at: Math.floor(Date.now() / 1_000) + 86_400,
    };
  }

  async function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  async function prepare() {
    const result = await prepareBillingSynchronization(customerId);
    assert.ok(result);
    return result;
  }

  async function apply(
    prepared: PreparedBillingSynchronization,
  ) {
    await prisma.$transaction(async (transaction) => {
      await applyBillingSynchronization(transaction, prepared);
    });
  }

  beforeEach(async () => {
    organizationId = "";

    assert.equal(env.STRIPE_MODE, "test");

    const suffix = randomUUID();

    customerId = `cus_test_${suffix}`;
    subscriptionId = `sub_test_${suffix}`;
    operationId = randomUUID();
    sessionId = `cs_test_${suffix}`;

    const organization = await prisma.organization.create({
      data: {
        name: `Checkout completion ${suffix}`,
        slug: `checkout-completion-${suffix}`,
      },
    });

    organizationId = organization.id;

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        checkoutOperationId: operationId,
        checkoutSessionId: sessionId,
        checkoutSessionExpiresAt: new Date(
          Date.now() + 86_400_000,
        ),
      },
    });

    const stripe = getStripeClient();

    mock.method(
      stripe.subscriptions,
      "list",
      async () => ({
        object: "list",
        data: [subscription()],
        has_more: false,
      }),
    );

    mock.method(
      stripe.checkout.sessions,
      "retrieve",
      async () => session(),
    );

    mock.method(
      stripe.checkout.sessions,
      "list",
      async () => ({
        object: "list",
        data: [session()],
        has_more: false,
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
  });

  it("clears a verified completed checkout while preserving billing and trial history", async () => {
    const before = await readBilling();
    const prepared = await prepare();

    assert.deepEqual(prepared.completedCheckout, {
      operationId,
      expectedSessionId: sessionId,
    });

    await apply(prepared);

    const billing = await readBilling();

    assert.equal(billing.id, before.id);
    assert.equal(billing.organizationId, organizationId);
    assert.equal(billing.stripeCustomerId, customerId);
    assert.equal(billing.stripeSubscriptionId, subscriptionId);
    assert.equal(billing.status, "TRIALING");
    assert.equal(billing.planId, "starter");

    assert.equal(billing.checkoutOperationId, null);
    assert.equal(billing.checkoutSessionId, null);
    assert.equal(billing.checkoutSessionExpiresAt, null);

    assert.equal(
      billing.trialStartedAt?.getTime(),
      1_767_225_600_000,
    );

    assert.ok(billing.lastSyncedAt);
  });

  it("clears a completed checkout whose session ID was never saved", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        checkoutSessionId: null,
        checkoutSessionExpiresAt: null,
      },
    });

    mock.method(
      getStripeClient().checkout.sessions,
      "retrieve",
      async () => {
        throw new Error(
          "Missing session IDs must be recovered through listing.",
        );
      },
    );

    const prepared = await prepare();

    assert.deepEqual(prepared.completedCheckout, {
      operationId,
      expectedSessionId: null,
    });

    await apply(prepared);

    const billing = await readBilling();

    assert.equal(billing.stripeSubscriptionId, subscriptionId);
    assert.equal(billing.checkoutOperationId, null);
    assert.equal(billing.checkoutSessionId, null);
    assert.equal(billing.checkoutSessionExpiresAt, null);
  });

  it("preserves an open checkout when a subscription event arrives first", async () => {
    mock.method(
      getStripeClient().checkout.sessions,
      "retrieve",
      async () => session("open"),
    );

    const prepared = await prepare();

    assert.equal(prepared.completedCheckout, undefined);

    await apply(prepared);

    const billing = await readBilling();

    assert.equal(billing.status, "TRIALING");
    assert.equal(billing.checkoutOperationId, operationId);
    assert.equal(billing.checkoutSessionId, sessionId);
    assert.ok(billing.checkoutSessionExpiresAt);
  });

  it("preserves a newer checkout claim created after preparation", async () => {
    const prepared = await prepare();

    assert.ok(prepared.completedCheckout);

    const newerOperationId = randomUUID();
    const newerSessionId = `cs_test_${randomUUID()}`;
    const newerExpiresAt = new Date(Date.now() + 172_800_000);

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        checkoutOperationId: newerOperationId,
        checkoutSessionId: newerSessionId,
        checkoutSessionExpiresAt: newerExpiresAt,
      },
    });

    await apply(prepared);

    const billing = await readBilling();

    assert.equal(
      billing.checkoutOperationId,
      newerOperationId,
    );
    assert.equal(billing.checkoutSessionId, newerSessionId);
    assert.equal(
      billing.checkoutSessionExpiresAt?.getTime(),
      newerExpiresAt.getTime(),
    );

    assert.equal(billing.stripeSubscriptionId, subscriptionId);
  });

  it("does not use an older subscription to clear the current claim", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "list",
      async () => ({
        object: "list",
        data: [subscription("canceled", randomUUID())],
        has_more: false,
      }),
    );

    mock.method(
      getStripeClient().checkout.sessions,
      "retrieve",
      async () => {
        throw new Error(
          "A different operation must not inspect this checkout.",
        );
      },
    );

    const prepared = await prepare();

    assert.equal(prepared.completedCheckout, undefined);

    await apply(prepared);

    const billing = await readBilling();

    assert.equal(billing.status, "CANCELED");
    assert.equal(billing.checkoutOperationId, operationId);
    assert.equal(billing.checkoutSessionId, sessionId);
  });

  it("rejects a completed checkout linked to another subscription", async () => {
    mock.method(
      getStripeClient().checkout.sessions,
      "retrieve",
      async () => session(
        "complete",
        `sub_other_${randomUUID()}`,
      ),
    );

    await assert.rejects(
      prepare(),
      { code: "BILLING_SYNC_RETRY_REQUIRED" },
    );

    const billing = await readBilling();

    assert.equal(billing.status, "NOT_SUBSCRIBED");
    assert.equal(billing.stripeSubscriptionId, null);
    assert.equal(billing.lastSyncedAt, null);
    assert.equal(billing.checkoutOperationId, operationId);
    assert.equal(billing.checkoutSessionId, sessionId);
  });

  it("retains an unresolved claim when session history is incomplete", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        checkoutSessionId: null,
        checkoutSessionExpiresAt: null,
      },
    });

    mock.method(
      getStripeClient().checkout.sessions,
      "list",
      async () => ({
        object: "list",
        data: [session()],
        has_more: true,
      }),
    );

    await assert.rejects(
      prepare(),
      { code: "BILLING_SYNC_RETRY_REQUIRED" },
    );

    const billing = await readBilling();

    assert.equal(billing.checkoutOperationId, operationId);
    assert.equal(billing.checkoutSessionId, null);
    assert.equal(billing.stripeSubscriptionId, null);
    assert.equal(billing.lastSyncedAt, null);
  });

  it("allows a new claim after cancellation without erasing the first trial", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "list",
      async () => ({
        object: "list",
        data: [subscription("canceled")],
        has_more: false,
      }),
    );

    await apply(await prepare());

    const canceled = await readBilling();

    assert.equal(canceled.status, "CANCELED");
    assert.equal(canceled.checkoutOperationId, null);
    assert.equal(canceled.checkoutSessionId, null);
    assert.equal(canceled.checkoutSessionExpiresAt, null);
    assert.ok(canceled.trialStartedAt);

    const nextOperationId = randomUUID();

    const claimed = await claimOrganizationCheckout(
      organizationId,
      customerId,
      nextOperationId,
    );

    assert.equal(claimed, true);

    const billing = await readBilling();

    assert.equal(billing.checkoutOperationId, nextOperationId);
    assert.equal(billing.stripeCustomerId, customerId);
    assert.equal(billing.stripeSubscriptionId, subscriptionId);

    assert.equal(
      billing.trialStartedAt?.getTime(),
      canceled.trialStartedAt.getTime(),
    );
  });
});

//************************************************************** */