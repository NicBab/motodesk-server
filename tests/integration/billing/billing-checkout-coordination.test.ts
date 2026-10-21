import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import {
  claimOrganizationCheckout,
  clearExpiredOrganizationCheckout,
  saveOrganizationCheckoutSession,
} from "../../../src/modules/billing/billing-checkout.repository.js";

//************************************************************** */

describe("Organization checkout coordination", () => {
  let organizationId: string;
  let customerId: string;

  beforeEach(async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Checkout coordination ${suffix}`,
        slug: `checkout-coordination-${suffix}`,
      },
    });

    organizationId = organization.id;
    customerId = `cus_test_${suffix}`;

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
      },
    });
  });

  afterEach(async () => {
    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });
  });

  async function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  async function claim() {
    const operationId = randomUUID();

    assert.equal(
      await claimOrganizationCheckout(
        organizationId,
        customerId,
        operationId,
      ),
      true,
    );

    return operationId;
  }

  it("allows only one concurrent checkout claim", async () => {
    const first = randomUUID();
    const second = randomUUID();

    const results = await Promise.all([
      claimOrganizationCheckout(
        organizationId,
        customerId,
        first,
      ),

      claimOrganizationCheckout(
        organizationId,
        customerId,
        second,
      ),
    ]);

    assert.equal(results.filter(Boolean).length, 1);

    const billing = await readBilling();

    assert.equal(
      billing.checkoutOperationId,
      results[0] ? first : second,
    );
  });

  it("rejects a customer mapping mismatch", async () => {
    const claimed = await claimOrganizationCheckout(
      organizationId,
      `cus_other_${randomUUID()}`,
      randomUUID(),
    );

    assert.equal(claimed, false);

    const billing = await readBilling();

    assert.equal(billing.checkoutOperationId, null);
  });

  it("blocks claims when a subscription is active", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { status: "ACTIVE" },
    });

    const claimed = await claimOrganizationCheckout(
      organizationId,
      customerId,
      randomUUID(),
    );

    assert.equal(claimed, false);
  });

  it("does not save a session under another operation's claim", async () => {
    const operationId = await claim();

    const saved = await saveOrganizationCheckoutSession(
      organizationId,
      randomUUID(),
      customerId,
      `cs_test_${randomUUID()}`,
      new Date(Date.now() + 60_000),
    );

    assert.equal(saved, false);

    const billing = await readBilling();

    assert.equal(billing.checkoutOperationId, operationId);
    assert.equal(billing.checkoutSessionId, null);
  });

  it("saves the claimed session once without allowing replacement", async () => {
    const operationId = await claim();
    const sessionId = `cs_test_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000);

    const saved = await saveOrganizationCheckoutSession(
      organizationId,
      operationId,
      customerId,
      sessionId,
      expiresAt,
    );

    assert.equal(saved, true);

    const replaced = await saveOrganizationCheckoutSession(
      organizationId,
      operationId,
      customerId,
      `cs_different_${randomUUID()}`,
      expiresAt,
    );

    assert.equal(replaced, false);

    const billing = await readBilling();

    assert.equal(billing.checkoutSessionId, sessionId);
    assert.equal(
      billing.checkoutSessionExpiresAt?.getTime(),
      expiresAt.getTime(),
    );
  });

  it("does not clear a checkout before its recorded expiration", async () => {
    const operationId = await claim();
    const sessionId = `cs_test_${randomUUID()}`;

    await saveOrganizationCheckoutSession(
      organizationId,
      operationId,
      customerId,
      sessionId,
      new Date(Date.now() + 60_000),
    );

    const cleared = await clearExpiredOrganizationCheckout(
      organizationId,
      operationId,
      sessionId,
    );

    assert.equal(cleared, false);

    const billing = await readBilling();

    assert.equal(billing.checkoutSessionId, sessionId);
    assert.equal(billing.checkoutOperationId, operationId);
  });

  it("clears an expired checkout only for its exact operation and session", async () => {
    const operationId = await claim();
    const sessionId = `cs_test_${randomUUID()}`;

    await saveOrganizationCheckoutSession(
      organizationId,
      operationId,
      customerId,
      sessionId,
      new Date(Date.now() - 60_000),
    );

    assert.equal(
      await clearExpiredOrganizationCheckout(
        organizationId,
        randomUUID(),
        sessionId,
      ),
      false,
    );

    assert.equal(
      await clearExpiredOrganizationCheckout(
        organizationId,
        operationId,
        `cs_other_${randomUUID()}`,
      ),
      false,
    );

    assert.equal(
      await clearExpiredOrganizationCheckout(
        organizationId,
        operationId,
        sessionId,
      ),
      true,
    );

    const billing = await readBilling();

    assert.equal(billing.checkoutOperationId, null);
    assert.equal(billing.checkoutSessionId, null);
    assert.equal(billing.checkoutSessionExpiresAt, null);
  });
});