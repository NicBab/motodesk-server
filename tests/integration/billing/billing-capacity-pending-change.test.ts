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
  BillingUserCapacityChangeStatus,
} from "../../../src/generated/prisma/client.js";

import {
  assertOrganizationUserCapacity,
} from "../../../src/modules/billing/billing-capacity.service.js";

//************************************************************** */

describe("Capacity enforcement during subscription changes", () => {
  const userIds: string[] = [];

  let organizationId: string;
  let billingId: string;
  let ownerId: string;
  let customerId: string;
  let subscriptionId: string;

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `pending-capacity-${randomUUID()}@example.com`,
        firstName: "Pending",
        lastName: "Capacity",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  async function seedMembers(count: number) {
    for (let index = 0; index < count; index += 1) {
      const user = await createUser();

      await prisma.membership.create({
        data: {
          organizationId,
          userId: user.id,
          role: "TECHNICIAN",
          status: "ACTIVE",
        },
      });
    }
  }

  async function seedChange(
    targetQuantity: number,
    status: BillingUserCapacityChangeStatus =
      BillingUserCapacityChangeStatus.PROCESSING,
  ) {
    const change = await prisma.billingUserCapacityChange.create({
      data: {
        organizationBillingId: billingId,
        requestedByUserId: ownerId,
        status,

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,

        expectedAdditionalUserQuantity: 2,
        targetAdditionalUserQuantity: targetQuantity,

        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",

        estimatedAmountDue: 0n,
        monthlyTotalAmount:
          29_900n + BigInt(targetQuantity) * 1_000n,

        stripeUpdateParameters: {},
        expiresAt: new Date(Date.now() + 600_000),
        submittedAt: new Date(),
      },
    });

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: change.id,
      },
    });

    return change;
  }

  function checkCapacity() {
    return prisma.$transaction(async (transaction) => {
      return assertOrganizationUserCapacity(
        transaction,
        organizationId,
      );
    });
  }

  beforeEach(async () => {
    organizationId = "";

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Pending capacity ${suffix}`,
        slug: `pending-capacity-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await createUser();
    ownerId = owner.id;

    await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    customerId = `cus_pending_${suffix}`;
    subscriptionId = `sub_pending_${suffix}`;

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,

        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,

        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: `price_pending_${suffix}`,
        stripeAdditionalUserItemId: `si_pending_${suffix}`,
      },
    });

    billingId = billing.id;
  });

  afterEach(async () => {
    if (organizationId) {
      await prisma.organization.deleteMany({
        where: { id: organizationId },
      });
    }

    await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    });

    userIds.length = 0;
  });

  for (const status of [
    BillingUserCapacityChangeStatus.PROCESSING,
    BillingUserCapacityChangeStatus.PENDING_PAYMENT,
    BillingUserCapacityChangeStatus.RECONCILIATION_REQUIRED,
  ]) {
    it(`reserves a reduction while the operation is ${status}`, async () => {
      // Ten users currently occupy a twelve-user subscription.
      await seedMembers(9);
      await seedChange(0, status);

      await assert.rejects(
        checkCapacity(),
        { code: "BILLING_USER_LIMIT_REACHED" },
      );

      const billing =
        await prisma.organizationBilling.findUniqueOrThrow({
          where: { organizationId },
        });

      // The guard reserves the reduction without pretending
      // Stripe has already applied the requested quantity.
      assert.equal(billing.additionalUserQuantity, 2);
      assert.ok(billing.activeUserCapacityChangeId);
    });
  }

  it("does not grant a pending increase before subscription synchronization", async () => {
    // Twelve users occupy all currently purchased slots.
    await seedMembers(11);

    // The requested future capacity would be fourteen.
    await seedChange(4);

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );

    const billing =
      await prisma.organizationBilling.findUniqueOrThrow({
        where: { organizationId },
      });

    assert.equal(billing.additionalUserQuantity, 2);
  });

  it("allows a slot that remains available under the reduced limit", async () => {
    // Nine users leave one slot under the requested limit of ten.
    await seedMembers(8);
    await seedChange(0);

    const user = await createUser();

    await prisma.$transaction(async (transaction) => {
      const capacity = await assertOrganizationUserCapacity(
        transaction,
        organizationId,
      );

      assert.equal(capacity.userLimit, 10);
      assert.equal(capacity.assignedUsers, 9);

      await transaction.membership.create({
        data: {
          organizationId,
          userId: user.id,
          role: "TECHNICIAN",
          status: "ACTIVE",
        },
      });
    });

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );
  });

  it("blocks capacity consumption when the active operation has a mismatched customer", async () => {
    const change = await seedChange(0);

    await prisma.billingUserCapacityChange.update({
      where: { id: change.id },
      data: {
        stripeCustomerId: `cus_other_${randomUUID()}`,
      },
    });

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_CAPACITY_RECONCILIATION_REQUIRED" },
    );
  });

  it("blocks capacity consumption when the active operation cannot be resolved", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: randomUUID(),
      },
    });

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_CAPACITY_RECONCILIATION_REQUIRED" },
    );
  });

  it("restores purchased capacity after a rejected reduction is released", async () => {
    await seedMembers(9);

    const change = await seedChange(0);

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );

    // Simulate a confirmed rejection and atomic claim release.
    await prisma.$transaction(async (transaction) => {
      await transaction.billingUserCapacityChange.update({
        where: { id: change.id },
        data: {
          status: "REJECTED",
          lastErrorCode: "BILLING_CAPACITY_CHANGE_REJECTED",
        },
      });

      await transaction.organizationBilling.update({
        where: { organizationId },
        data: {
          activeUserCapacityChangeId: null,
        },
      });
    });

    const capacity = await checkCapacity();

    assert.equal(capacity.userLimit, 12);
    assert.equal(capacity.assignedUsers, 10);
  });
});

//************************************************************** */