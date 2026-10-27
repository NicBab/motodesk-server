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
  claimBillingPlanChange,
  createBillingPlanChangePreview,
} from "../../../src/modules/billing/billing-plan-change.repository.js";

import {
  claimBillingUserCapacityChange,
  createBillingUserCapacityPreview,
} from "../../../src/modules/billing/billing-user-capacity.repository.js";

//************************************************************** */

describe("Plan-change and user-capacity coordination", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  let organizationId: string;
  let billingId: string;
  let ownerId: string;
  let customerId: string;
  let subscriptionId: string;
  let priceId: string;
  let baseline: Date;

  function createPlanPreview() {
    return createBillingPlanChangePreview(
      organizationId,
      ownerId,
      {
        organizationBillingId: billingId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedStripePriceId: priceId,

        expectedPlanId: "pro",
        targetPlanId: "business",
        expectedAdditionalUserQuantity: 2,
        targetAdditionalUserQuantity: 0,

        expectedLastSyncedAt: baseline,
        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",
        estimatedAmountDue: 0n,
        monthlyTotalAmount: 18_900n,

        stripeUpdateParameters: {
          items: [
            {
              id: "si_coordination_base",
              price: "price_coordination_business",
              quantity: 1,
            },
            {
              id: "si_coordination_additional",
              deleted: true,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
        },

        expiresAt: new Date(Date.now() + 600_000),
      },
    );
  }

  function createCapacityPreview() {
    return createBillingUserCapacityPreview(
      organizationId,
      ownerId,
      {
        organizationBillingId: billingId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,

        expectedAdditionalUserQuantity: 2,
        targetAdditionalUserQuantity: 3,

        expectedLastSyncedAt: baseline,
        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",
        estimatedAmountDue: 500n,
        monthlyTotalAmount: 32_900n,

        stripeUpdateParameters: {
          items: [
            {
              id: "si_coordination_additional",
              quantity: 3,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
        },

        expiresAt: new Date(Date.now() + 600_000),
      },
    );
  }

  function claimPlan(changeId: string) {
    return claimBillingPlanChange(
      organizationId,
      ownerId,
      changeId,
    );
  }

  function claimCapacity(changeId: string) {
    return claimBillingUserCapacityChange(
      organizationId,
      ownerId,
      changeId,
    );
  }

  function readBilling() {
    return prisma.organizationBilling.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  beforeEach(async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Billing coordination ${suffix}`,
        slug: `billing-coordination-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    const owner = await prisma.user.create({
      data: {
        email: `billing-coordination-${suffix}@example.com`,
        firstName: "Billing",
        lastName: "Coordination",
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

    customerId = `cus_coordination_${suffix}`;
    subscriptionId = `sub_coordination_${suffix}`;
    priceId = `price_coordination_pro_${suffix}`;
    baseline = new Date(Date.now() - 60_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,

        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,

        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId:
          `price_coordination_additional_${suffix}`,
        stripeAdditionalUserItemId:
          "si_coordination_additional",

        lastSyncedAt: baseline,
      },
    });

    billingId = billing.id;
  });

  afterEach(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: organizationIds },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    });

    organizationIds.length = 0;
    userIds.length = 0;
  });

  it("allows only one flow to claim a subscription during concurrent confirmation", async () => {
    const plan = await createPlanPreview();
    const capacity = await createCapacityPreview();

    const results = await Promise.allSettled([
      claimPlan(plan.id),
      claimCapacity(capacity.id),
    ]);

    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );

    const rejected = results.find(
      (result) => result.status === "rejected",
    );

    assert.ok(rejected);
    assert.equal(
      rejected.reason.code,
      "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    );

    const billing = await readBilling();

    assert.equal(
      Number(billing.activePlanChangeId !== null) +
        Number(billing.activeUserCapacityChangeId !== null),
      1,
    );

    const storedPlan = await prisma.billingPlanChange.findUniqueOrThrow({
      where: { id: plan.id },
    });

    const storedCapacity =
      await prisma.billingUserCapacityChange.findUniqueOrThrow({
        where: { id: capacity.id },
      });

    if (billing.activePlanChangeId === plan.id) {
      assert.equal(storedPlan.status, "PROCESSING");
      assert.equal(storedCapacity.status, "QUOTED");
      assert.equal(storedCapacity.submittedAt, null);
    } else {
      assert.equal(billing.activeUserCapacityChangeId, capacity.id);
      assert.equal(storedCapacity.status, "PROCESSING");
      assert.equal(storedPlan.status, "QUOTED");
      assert.equal(storedPlan.submittedAt, null);
    }

    assert.equal(billing.planId, "pro");
    assert.equal(billing.additionalUserQuantity, 2);
  });

  it("blocks new capacity previews after a plan change is claimed", async () => {
    const plan = await createPlanPreview();
    await claimPlan(plan.id);

    await assert.rejects(createCapacityPreview(), {
      code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    });

    assert.equal(
      await prisma.billingUserCapacityChange.count({
        where: { organizationBillingId: billingId },
      }),
      0,
    );
  });

  it("blocks a previously quoted capacity change after a plan change is claimed", async () => {
    const capacity = await createCapacityPreview();
    const plan = await createPlanPreview();

    await claimPlan(plan.id);

    await assert.rejects(claimCapacity(capacity.id), {
      code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    });

    const stored =
      await prisma.billingUserCapacityChange.findUniqueOrThrow({
        where: { id: capacity.id },
      });

    assert.equal(stored.status, "QUOTED");
    assert.equal(stored.submittedAt, null);
    assert.equal((await readBilling()).activeUserCapacityChangeId, null);
  });

  it("blocks plan previews and confirmations after a capacity change is claimed", async () => {
    const plan = await createPlanPreview();
    const capacity = await createCapacityPreview();

    await claimCapacity(capacity.id);

    await assert.rejects(createPlanPreview(), {
      code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    });

    await assert.rejects(claimPlan(plan.id), {
      code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    });

    const stored = await prisma.billingPlanChange.findUniqueOrThrow({
      where: { id: plan.id },
    });

    assert.equal(stored.status, "QUOTED");
    assert.equal(stored.submittedAt, null);
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  for (const status of [
    "PROCESSING",
    "PENDING_PAYMENT",
  ] as const) {
    it(`blocks a ${status} capacity retry if both operation pointers are present`, async () => {
      const plan = await createPlanPreview();
      const capacity = await createCapacityPreview();

      await claimCapacity(capacity.id);

      // Deliberately seed an inconsistent state to verify that
      // retries fail closed instead of submitting another change.
      await prisma.$transaction(async (transaction) => {
        await transaction.billingUserCapacityChange.update({
          where: { id: capacity.id },
          data: { status },
        });

        await transaction.billingPlanChange.update({
          where: { id: plan.id },
          data: {
            status: "PROCESSING",
            submittedAt: new Date(),
          },
        });

        await transaction.organizationBilling.update({
          where: { organizationId },
          data: {
            activePlanChangeId: plan.id,
          },
        });
      });

      await assert.rejects(claimCapacity(capacity.id), {
        code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
      });

      await assert.rejects(claimPlan(plan.id), {
        code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
      });

      const billing = await readBilling();

      assert.equal(billing.activePlanChangeId, plan.id);
      assert.equal(billing.activeUserCapacityChangeId, capacity.id);
    });
  }

  it("returns a historical applied capacity result without disturbing a later plan claim", async () => {
    const capacity = await createCapacityPreview();
    await claimCapacity(capacity.id);

    await prisma.$transaction(async (transaction) => {
      await transaction.billingUserCapacityChange.update({
        where: { id: capacity.id },
        data: {
          status: "APPLIED",
          appliedAt: new Date(),
        },
      });

      await transaction.organizationBilling.update({
        where: { organizationId },
        data: {
          additionalUserQuantity: 3,
          activeUserCapacityChangeId: null,
        },
      });
    });

    const plan = await createBillingPlanChangePreview(
      organizationId,
      ownerId,
      {
        organizationBillingId: billingId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedStripePriceId: priceId,

        expectedPlanId: "pro",
        targetPlanId: "business",
        expectedAdditionalUserQuantity: 3,
        targetAdditionalUserQuantity: 0,

        expectedLastSyncedAt: baseline,
        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",
        estimatedAmountDue: 0n,
        monthlyTotalAmount: 18_900n,
        stripeUpdateParameters: {},
        expiresAt: new Date(Date.now() + 600_000),
      },
    );

    await claimPlan(plan.id);

    const result = await claimCapacity(capacity.id);

    assert.equal(result.outcome, "applied");

    const billing = await readBilling();

    assert.equal(billing.activePlanChangeId, plan.id);
    assert.equal(billing.activeUserCapacityChangeId, null);
    assert.equal(billing.additionalUserQuantity, 3);
  });
});

//************************************************************** */