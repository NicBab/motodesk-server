import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import type {
  BillingPlanChangeStatus,
} from "../../../src/generated/prisma/client.js";

import {
  assertOrganizationUserCapacity,
} from "../../../src/modules/billing/billing-capacity.service.js";

//************************************************************** */

describe("Capacity enforcement during plan changes", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  let organizationId: string;
  let billingId: string;
  let ownerId: string;
  let ownerMembershipId: string;
  let customerId: string;
  let subscriptionId: string;

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `plan-capacity-${randomUUID()}@example.com`,
        firstName: "Plan",
        lastName: "Capacity",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);
    return user;
  }

  async function addMembers(
    count: number,
    status: "ACTIVE" | "INVITED" = "ACTIVE",
  ) {
    for (let index = 0; index < count; index += 1) {
      const user = await createUser();

      await prisma.membership.create({
        data: {
          organizationId,
          userId: user.id,
          role: "TECHNICIAN",
          status,
        },
      });
    }
  }

  async function setPurchasedPlan(
    planId: "starter" | "business" | "pro",
    additionalUserQuantity = 0,
  ) {
    const amounts = {
      starter: 8_900,
      business: 18_900,
      pro: 29_900,
    };

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        planId,
        unitAmount: amounts[planId],
        stripePriceId: `price_${planId}_${billingId}`,
        additionalUserQuantity,

        additionalUserUnitAmount:
          additionalUserQuantity > 0 ? 1_000 : null,

        stripeAdditionalUserPriceId:
          additionalUserQuantity > 0
            ? `price_additional_${billingId}`
            : null,

        stripeAdditionalUserItemId:
          additionalUserQuantity > 0
            ? `si_additional_${billingId}`
            : null,
      },
    });
  }

  async function seedChange(
    status: BillingPlanChangeStatus = "PROCESSING",
    upgrade = false,
  ) {
    const change = await prisma.billingPlanChange.create({
      data: {
        organizationBillingId: billingId,
        requestedByUserId: ownerId,
        status,

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,

        expectedStripePriceId: upgrade
          ? `price_starter_${billingId}`
          : `price_pro_${billingId}`,

        expectedPlanId: upgrade ? "starter" : "pro",
        targetPlanId: upgrade ? "pro" : "business",

        expectedAdditionalUserQuantity: upgrade ? 0 : 2,
        targetAdditionalUserQuantity: upgrade ? 2 : 0,

        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",
        estimatedAmountDue: 0n,
        monthlyTotalAmount: upgrade ? 31_900n : 18_900n,

        stripeUpdateParameters: {},
        expiresAt: new Date(Date.now() + 600_000),
        submittedAt: new Date(),
      },
    });

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activePlanChangeId: change.id,
      },
    });

    return change;
  }

  function checkCapacity() {
    return prisma.$transaction((transaction) =>
      assertOrganizationUserCapacity(
        transaction,
        organizationId,
      ),
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
        name: `Plan capacity ${suffix}`,
        slug: `plan-capacity-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    const owner = await createUser();
    ownerId = owner.id;

    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    ownerMembershipId = membership.id;
    customerId = `cus_plan_capacity_${suffix}`;
    subscriptionId = `sub_plan_capacity_${suffix}`;

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,
      },
    });

    billingId = billing.id;

    await setPurchasedPlan("pro", 2);
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

  for (const status of [
    "PROCESSING",
    "PENDING_PAYMENT",
    "RECONCILIATION_REQUIRED",
  ] as const) {
    it(`reserves Business capacity while a downgrade is ${status}`, async () => {
      await addMembers(4);
      await seedChange(status);

      await assert.rejects(checkCapacity(), {
        code: "BILLING_USER_LIMIT_REACHED",
      });

      const billing = await readBilling();

      assert.equal(billing.planId, "pro");
      assert.equal(billing.additionalUserQuantity, 2);
      assert.ok(billing.activePlanChangeId);
    });
  }

  it("allows a slot below the pending downgrade limit", async () => {
    await addMembers(3);
    await seedChange();

    const capacity = await checkCapacity();

    assert.equal(capacity.assignedUsers, 4);
    assert.equal(capacity.userLimit, 5);
  });

  it("does not grant a pending upgrade before synchronization", async () => {
    await setPurchasedPlan("starter");
    await addMembers(1);
    await seedChange("PROCESSING", true);

    await assert.rejects(checkCapacity(), {
      code: "BILLING_USER_LIMIT_REACHED",
    });

    assert.equal((await readBilling()).planId, "starter");
  });

  it("recognizes synchronized upgrade capacity while its claim is still present", async () => {
    await setPurchasedPlan("starter");
    await addMembers(1);
    await seedChange("PROCESSING", true);

    // Simulate validated subscription synchronization.
    await setPurchasedPlan("pro", 2);

    const capacity = await checkCapacity();

    assert.equal(capacity.assignedUsers, 2);
    assert.equal(capacity.userLimit, 12);
  });

  it("counts invited memberships and pending invitations against the lower limit", async () => {
    await addMembers(2);
    await addMembers(1, "INVITED");

    await prisma.membershipInvitation.create({
      data: {
        organizationId,
        invitedByMembershipId: ownerMembershipId,
        email: `reserved-plan-${randomUUID()}@example.com`,
        role: "TECHNICIAN",
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await seedChange();

    // Owner + two active + one invited + one invitation = five.
    await assert.rejects(checkCapacity(), {
      code: "BILLING_USER_LIMIT_REACHED",
    });
  });

  it("blocks an operation with a mismatched Stripe customer", async () => {
    const change = await seedChange();

    await prisma.billingPlanChange.update({
      where: { id: change.id },
      data: {
        stripeCustomerId: `cus_other_${randomUUID()}`,
      },
    });

    await assert.rejects(checkCapacity(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });
  });

  it("does not accept another organization's operation pointer", async () => {
    const change = await seedChange();
    const suffix = randomUUID();

    const otherOrganization = await prisma.organization.create({
      data: {
        name: `Other capacity ${suffix}`,
        slug: `other-capacity-${suffix}`,
      },
    });

    organizationIds.push(otherOrganization.id);

    const otherBilling = await prisma.organizationBilling.create({
      data: {
        organizationId: otherOrganization.id,
      },
    });

    await prisma.billingPlanChange.update({
      where: { id: change.id },
      data: {
        organizationBillingId: otherBilling.id,
      },
    });

    await assert.rejects(checkCapacity(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });
  });

  it("blocks a missing operation record", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activePlanChangeId: randomUUID(),
      },
    });

    await assert.rejects(checkCapacity(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });
  });

  it("blocks invalid target capacity terms", async () => {
    const change = await seedChange();

    // Business cannot have Pro additional-user quantities.
    await prisma.billingPlanChange.update({
      where: { id: change.id },
      data: {
        targetAdditionalUserQuantity: 1,
      },
    });

    await assert.rejects(checkCapacity(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });
  });

  it("blocks a subscription state matching neither the source nor target", async () => {
    await seedChange();
    await setPurchasedPlan("starter");

    await assert.rejects(checkCapacity(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });
  });

  it("blocks simultaneous plan and additional-user operation pointers", async () => {
    await seedChange();

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: randomUUID(),
      },
    });

    await assert.rejects(checkCapacity(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });
  });

  it("restores purchased capacity after a rejected downgrade is released", async () => {
    await addMembers(4);
    const change = await seedChange();

    await assert.rejects(checkCapacity(), {
      code: "BILLING_USER_LIMIT_REACHED",
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.billingPlanChange.update({
        where: { id: change.id },
        data: {
          status: "REJECTED",
          lastErrorCode: "BILLING_PLAN_CHANGE_REJECTED",
        },
      });

      await transaction.organizationBilling.update({
        where: { organizationId },
        data: {
          activePlanChangeId: null,
        },
      });
    });

    const capacity = await checkCapacity();

    assert.equal(capacity.userLimit, 12);
    assert.equal(capacity.assignedUsers, 5);
  });

  it("blocks a terminal operation whose active pointer was not cleared", async () => {
    await seedChange("APPLIED");

    await assert.rejects(checkCapacity(), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });
  });
});

//************************************************************** */