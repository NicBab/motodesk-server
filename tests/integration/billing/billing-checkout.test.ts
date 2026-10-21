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

import { prisma } from "../../../src/config/prisma.js";
import { env } from "../../../src/config/env.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

import {
  createOrganizationBillingCheckout,
} from "../../../src/modules/billing/billing-checkout.service.js";

//************************************************************** */

describe("Organization billing checkout", () => {
  let organizationId: string;
  let userId: string;
  let customerId: string;
  let priceId: string;

  let checkoutRequests: Stripe.Checkout.SessionCreateParams[];

  let createdSession:
    | ReturnType<typeof makeSession>
    | undefined;

  function makeSession(
    input: Stripe.Checkout.SessionCreateParams,
  ) {
    return {
      id: `cs_test_${randomUUID()}`,
      object: "checkout.session",
      mode: "subscription",
      status: "open",
      livemode: false,
      customer: customerId,
      client_reference_id: organizationId,
      metadata: input.metadata,
      expires_at: Math.floor(Date.now() / 1_000) + 86_400,
      url: "https://checkout.stripe.com/test-motodesk",
    };
  }

  function createCheckout() {
    return createOrganizationBillingCheckout(
      organizationId,
      userId,
      { planId: "starter" },
    );
  }

  async function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");

    assert.ok(
      env.STRIPE_WEBHOOK_SECRET,
      "Configure STRIPE_WEBHOOK_SECRET before running checkout tests.",
    );

    checkoutRequests = [];
    createdSession = undefined;

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Billing checkout ${suffix}`,
        slug: `billing-checkout-${suffix}`,
      },
    });

    organizationId = organization.id;
    customerId = `cus_test_${suffix}`;
    priceId = `price_test_${suffix}`;

    const user = await prisma.user.create({
      data: {
        email: `billing-checkout-${suffix}@example.com`,
        firstName: "Billing",
        lastName: "Checkout",
        emailVerifiedAt: new Date(),
      },
    });

    userId = user.id;

    await prisma.membership.create({
      data: {
        organizationId,
        userId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
      },
    });

    const stripe = getStripeClient();

    mock.method(
      stripe.customers,
      "create",
      () => {
        throw new Error(
          "Existing customer mapping must be reused.",
        );
      },
    );

    mock.method(
      stripe.customers,
      "retrieve",
      async () => ({
        id: customerId,
        object: "customer",
        livemode: false,
        metadata: { organizationId },
      }),
    );

    mock.method(
      stripe.subscriptions,
      "list",
      async () => ({
        object: "list",
        data: [],
        has_more: false,
      }),
    );

    mock.method(
      stripe.prices,
      "list",
      async () => ({
        object: "list",
        has_more: false,

        data: [
          {
            id: priceId,
            active: true,
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

            product: {
              id: `prod_test_${suffix}`,
              active: true,
              livemode: false,
            },
          },
        ],
      }),
    );

    mock.method(
      stripe.checkout.sessions,
      "create",
      async (input: Stripe.Checkout.SessionCreateParams) => {
        checkoutRequests.push(input);
        createdSession = makeSession(input);

        return createdSession;
      },
    );

    mock.method(
      stripe.checkout.sessions,
      "retrieve",
      async () => {
        assert.ok(createdSession);
        return createdSession;
      },
    );

    mock.method(
      stripe.checkout.sessions,
      "list",
      async () => ({
        object: "list",
        data: [],
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

    if (userId) {
      await prisma.auditLog.deleteMany({
        where: { actorUserId: userId },
      });

      await prisma.user.deleteMany({
        where: { id: userId },
      });
    }
  });

  it("creates the selected monthly checkout with a first-time trial", async () => {
    const result = await createCheckout();

    assert.equal(
      result.url,
      "https://checkout.stripe.com/test-motodesk",
    );

    assert.equal(checkoutRequests.length, 1);

    const input = checkoutRequests[0]!;

    assert.equal(input.mode, "subscription");
    assert.equal(input.customer, customerId);
    assert.equal(input.client_reference_id, organizationId);
    assert.equal(input.payment_method_collection, "always");

    assert.deepEqual(input.line_items, [
      { price: priceId, quantity: 1 },
    ]);

    assert.equal(
      input.subscription_data?.trial_period_days,
      14,
    );

    assert.equal(input.metadata?.organizationId, organizationId);
    assert.equal(input.metadata?.planId, "starter");

    assert.equal(
      input.subscription_data?.metadata?.organizationId,
      organizationId,
    );

    const success = new URL(input.success_url!);
    const cancel = new URL(input.cancel_url!);

    assert.equal(
      success.origin,
      new URL(env.CLIENT_URL).origin,
    );

    assert.equal(success.pathname, "/settings");
    assert.equal(success.searchParams.get("billing"), "success");
    assert.equal(cancel.searchParams.get("billing"), "canceled");

    const billing = await readBilling();

    assert.equal(
      billing.checkoutSessionId,
      createdSession!.id,
    );

    assert.equal(
      billing.checkoutOperationId,
      input.metadata?.checkoutOperationId,
    );

    // Creating checkout does not establish a paid subscription.
    assert.equal(billing.status, "NOT_SUBSCRIBED");
    assert.equal(billing.stripeSubscriptionId, null);
  });

  it("reuses an open checkout instead of creating another", async () => {
    const first = await createCheckout();
    const second = await createCheckout();

    assert.equal(first.url, second.url);
    assert.equal(checkoutRequests.length, 1);
  });

  it("does not grant another trial after a recorded trial", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },

      data: {
        trialStartedAt: new Date(
          "2026-01-01T00:00:00.000Z",
        ),
      },
    });

    await createCheckout();

    assert.equal(checkoutRequests.length, 1);

    assert.equal(
      checkoutRequests[0]!.subscription_data?.trial_period_days,
      undefined,
    );
  });

  it("blocks checkout when Stripe already has a current subscription", async () => {
    mock.method(
      getStripeClient().subscriptions,
      "list",
      async () => ({
        object: "list",
        has_more: false,

        data: [
          {
            id: `sub_test_${randomUUID()}`,
            status: "active",
          },
        ],
      }),
    );

    await assert.rejects(
      createCheckout(),
      { code: "BILLING_SUBSCRIPTION_ALREADY_EXISTS" },
    );

    assert.equal(checkoutRequests.length, 0);
    assert.equal(
      (await readBilling()).checkoutOperationId,
      null,
    );
  });

  it("retains an unconfirmed claim and blocks replacement checkout", async () => {
    let attempts = 0;

    mock.method(
      getStripeClient().checkout.sessions,
      "create",
      async () => {
        attempts += 1;
        throw new Error("Simulated interrupted Stripe response.");
      },
    );

    await assert.rejects(
      createCheckout(),
      { code: "BILLING_CHECKOUT_UNCONFIRMED" },
    );

    const interrupted = await readBilling();

    assert.ok(interrupted.checkoutOperationId);
    assert.equal(interrupted.checkoutSessionId, null);

    await assert.rejects(
      createCheckout(),
      {
        code: "BILLING_CHECKOUT_RECONCILIATION_REQUIRED",
      },
    );

    const retried = await readBilling();

    assert.equal(attempts, 1);

    assert.equal(
      retried.checkoutOperationId,
      interrupted.checkoutOperationId,
    );

    assert.equal(retried.checkoutSessionId, null);
  });
});