import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import { prisma } from "../../../src/config/prisma.js";
import { env } from "../../../src/config/env.js";

import {
  getStripeClient,
} from "../../../src/config/stripe.js";

import {
  recoverOrganizationCheckout,
} from "../../../src/modules/billing/billing-checkout-recovery.service.js";

//************************************************************** */

describe("Interrupted checkout recovery", () => {
  let organizationId: string;
  let customerId: string;
  let operationId: string;
  let sessionId: string;
  let expiresAt: number;

  function session() {
    return {
      id: sessionId,
      object: "checkout.session",
      mode: "subscription",
      livemode: false,
      customer: customerId,
      client_reference_id: organizationId,
      status: "open",
      expires_at: expiresAt,

      metadata: {
        organizationId,
        checkoutOperationId: operationId,
        planId: "starter",
      },
    };
  }

  function mockSessions(
    data: unknown[],
    hasMore = false,
  ): void {
    mock.method(
      getStripeClient().checkout.sessions,
      "list",
      async () => ({
        object: "list",
        data,
        has_more: hasMore,
        url: "/v1/checkout/sessions",
      }),
    );
  }

  async function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  beforeEach(async () => {
    assert.equal(env.STRIPE_MODE, "test");

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Checkout recovery ${suffix}`,
        slug: `checkout-recovery-${suffix}`,
      },
    });

    organizationId = organization.id;
    customerId = `cus_test_${suffix}`;
    operationId = randomUUID();
    sessionId = `cs_test_${suffix}`;
    expiresAt = Math.floor(Date.now() / 1_000) + 3_600;

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        checkoutOperationId: operationId,
      },
    });

    // Recovery must never create a replacement checkout.
    mock.method(
      getStripeClient().checkout.sessions,
      "create",
      () => {
        throw new Error(
          "Recovery must not create checkout sessions.",
        );
      },
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

  it("recovers the exact matching checkout session", async () => {
    mockSessions([session()]);

    assert.equal(
      await recoverOrganizationCheckout(organizationId),
      true,
    );

    const billing = await readBilling();

    assert.equal(billing.checkoutOperationId, operationId);
    assert.equal(billing.checkoutSessionId, sessionId);
    assert.equal(
      billing.checkoutSessionExpiresAt?.getTime(),
      expiresAt * 1_000,
    );

    assert.equal(billing.status, "NOT_SUBSCRIBED");
    assert.equal(billing.stripeSubscriptionId, null);
  });

  it("retains unresolved claims when no matching session is found", async () => {
    mockSessions([
      {
        ...session(),

        metadata: {
          ...session().metadata,
          checkoutOperationId: randomUUID(),
        },
      },
    ]);

    assert.equal(
      await recoverOrganizationCheckout(organizationId),
      false,
    );

    const billing = await readBilling();

    assert.equal(billing.checkoutOperationId, operationId);
    assert.equal(billing.checkoutSessionId, null);
  });

  it("rejects multiple matching sessions without attaching either", async () => {
    mockSessions([
      session(),
      {
        ...session(),
        id: `cs_other_${randomUUID()}`,
      },
    ]);

    await assert.rejects(
      recoverOrganizationCheckout(organizationId),
      {
        code: "BILLING_CHECKOUT_RECONCILIATION_REQUIRED",
      },
    );

    assert.equal(
      (await readBilling()).checkoutSessionId,
      null,
    );
  });

  it("rejects mismatched customer, mode, and organization references", async () => {
    const invalidSessions = [
      {
        ...session(),
        customer: `cus_other_${randomUUID()}`,
      },
      {
        ...session(),
        livemode: true,
      },
      {
        ...session(),
        mode: "payment",
      },
      {
        ...session(),
        client_reference_id: "another-organization",
      },
    ];

    for (const invalid of invalidSessions) {
      mockSessions([invalid]);

      await assert.rejects(
        recoverOrganizationCheckout(organizationId),
        {
          code: "BILLING_CHECKOUT_RECONCILIATION_REQUIRED",
        },
      );

      assert.equal(
        (await readBilling()).checkoutSessionId,
        null,
      );

      mock.restoreAll();

      mock.method(
        getStripeClient().checkout.sessions,
        "create",
        () => {
          throw new Error(
            "Recovery must not create checkout sessions.",
          );
        },
      );
    }
  });

  it("does not reconcile from incomplete session history", async () => {
    mockSessions([session()], true);

    await assert.rejects(
      recoverOrganizationCheckout(organizationId),
      {
        code: "BILLING_CHECKOUT_RECONCILIATION_REQUIRED",
      },
    );

    const billing = await readBilling();

    assert.equal(billing.checkoutOperationId, operationId);
    assert.equal(billing.checkoutSessionId, null);
  });

  it("allows concurrent recovery to attach the same session safely", async () => {
    mockSessions([session()]);

    const results = await Promise.all([
      recoverOrganizationCheckout(organizationId),
      recoverOrganizationCheckout(organizationId),
    ]);

    assert.deepEqual(results, [true, true]);

    const billing = await readBilling();

    assert.equal(billing.checkoutSessionId, sessionId);
    assert.equal(billing.checkoutOperationId, operationId);
  });

  it("leaves the claim intact when Stripe lookup fails", async () => {
    mock.method(
      getStripeClient().checkout.sessions,
      "list",
      async () => {
        throw new Error("Simulated Stripe lookup failure.");
      },
    );

    await assert.rejects(
      recoverOrganizationCheckout(organizationId),
      /Simulated Stripe lookup failure/,
    );

    const billing = await readBilling();

    assert.equal(billing.checkoutOperationId, operationId);
    assert.equal(billing.checkoutSessionId, null);
  });
});