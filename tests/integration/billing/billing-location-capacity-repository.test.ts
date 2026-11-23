
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import {
  claimBillingLocationCapacityChange,
} from "../../../src/modules/billing/billing-location-capacity.repository.js";

describe("Billing location-capacity purchase claims", () => {
  let organizationId: string;
  let ownerId: string;
  let changeId: string;

  beforeEach(async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Location capacity ${suffix}`,
        slug: `location-capacity-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await prisma.user.create({
      data: {
        email: `location-capacity-${suffix}@example.com`,
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

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,
        stripeCustomerId: `cus_${suffix}`,
        stripeSubscriptionId: `sub_${suffix}`,
        stripePriceId: "price_pro",
        lastSyncedAt: new Date(),
      },
    });

    const change = await prisma.billingLocationCapacityChange.create({
      data: {
        organizationBillingId: billing.id,
        requestedByUserId: ownerId,
        stripeCustomerId: billing.stripeCustomerId!,
        stripeSubscriptionId: billing.stripeSubscriptionId!,
        expectedAdditionalLocationQuantity: 0,
        targetAdditionalLocationQuantity: 1,
        expectedLastSyncedAt: billing.lastSyncedAt,
        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",
        estimatedAmountDue: 4_000n,
        monthlyTotalAmount: 33_900n,
        stripeUpdateParameters: {
          items: [{ price: "price_location", quantity: 1 }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
        },
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    changeId = change.id;
  });

  afterEach(async () => {
    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });

    await prisma.user.deleteMany({
      where: { id: ownerId },
    });
  });

  it("claims a quoted purchase without activating capacity", async () => {
    const result = await claimBillingLocationCapacityChange(
      organizationId,
      ownerId,
      changeId,
    );

    assert.equal(result.outcome, "submit");
    assert.equal(result.change.status, "PROCESSING");

    const billing = await prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });

    assert.equal(billing.activeLocationCapacityChangeId, changeId);
    assert.equal(billing.additionalLocationQuantity, 0);
  });

  it("allows a processing retry without creating another claim", async () => {
    const first = await claimBillingLocationCapacityChange(
      organizationId,
      ownerId,
      changeId,
    );

    const second = await claimBillingLocationCapacityChange(
      organizationId,
      ownerId,
      changeId,
    );

    assert.equal(first.outcome, "submit");
    assert.equal(second.outcome, "submit");
    assert.equal(second.change.id, first.change.id);

    const count = await prisma.billingLocationCapacityChange.count({
      where: { id: changeId },
    });

    assert.equal(count, 1);
  });

  it("rejects a second purchase while another is active", async () => {
    await claimBillingLocationCapacityChange(
      organizationId,
      ownerId,
      changeId,
    );

    const original = await prisma.billingLocationCapacityChange.findUniqueOrThrow({
      where: { id: changeId },
    });

    const second = await prisma.billingLocationCapacityChange.create({
      data: {
        organizationBillingId: original.organizationBillingId,
        requestedByUserId: ownerId,
        stripeCustomerId: original.stripeCustomerId,
        stripeSubscriptionId: original.stripeSubscriptionId,
        expectedAdditionalLocationQuantity: 0,
        targetAdditionalLocationQuantity: 2,
        expectedLastSyncedAt: original.expectedLastSyncedAt,
        prorationDate: original.prorationDate,
        currency: "usd",
        estimatedAmountDue: 8_000n,
        monthlyTotalAmount: 37_900n,
        stripeUpdateParameters: {
          items: [{ price: "price_location", quantity: 2 }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
        },
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    await assert.rejects(
      claimBillingLocationCapacityChange(
        organizationId,
        ownerId,
        second.id,
      ),
      { code: "BILLING_LOCATION_CHANGE_IN_PROGRESS" },
    );

    const billing = await prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });

    assert.equal(billing.activeLocationCapacityChangeId, changeId);
    assert.equal(billing.additionalLocationQuantity, 0);
  });
});
