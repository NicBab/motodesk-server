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
  claimBillingUserCapacityChange,
  createBillingUserCapacityPreview,
  findBillingUserCapacityChange,
  type BillingUserCapacityPreviewData,
} from "../../../src/modules/billing/billing-user-capacity.repository.js";

//************************************************************** */

describe("Billing user-capacity change repository", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  let organizationId: string;
  let billingId: string;
  let ownerId: string;
  let ownerMembershipId: string;
  let customerId: string;
  let subscriptionId: string;
  let baseline: Date;

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `capacity-operation-${randomUUID()}@example.com`,
        firstName: "Capacity",
        lastName: "Operation",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  function previewData(
    overrides: Partial<BillingUserCapacityPreviewData> = {},
  ): BillingUserCapacityPreviewData {
    return {
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
            id: "si_operation_additional",
            quantity: 3,
          },
        ],
        payment_behavior: "pending_if_incomplete",
        proration_behavior: "always_invoice",
      },

      expiresAt: new Date(Date.now() + 600_000),

      ...overrides,
    };
  }

  function createPreview(
    overrides: Partial<BillingUserCapacityPreviewData> = {},
  ) {
    return createBillingUserCapacityPreview(
      organizationId,
      ownerId,
      previewData(overrides),
    );
  }

  function claim(changeId: string) {
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
        name: `Capacity operation ${suffix}`,
        slug: `capacity-operation-${suffix}`,
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
    customerId = `cus_operation_${suffix}`;
    subscriptionId = `sub_operation_${suffix}`;
    baseline = new Date(Date.now() - 60_000);

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: `price_pro_${suffix}`,

        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,

        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: `price_additional_${suffix}`,
        stripeAdditionalUserItemId: "si_operation_additional",

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

  it("stores a preview without changing purchased capacity or claiming an operation", async () => {
    const input = previewData();

    const change = await createBillingUserCapacityPreview(
      organizationId,
      ownerId,
      input,
    );

    assert.equal(change.status, "QUOTED");
    assert.equal(change.requestedByUserId, ownerId);
    assert.equal(change.organizationBillingId, billingId);
    assert.equal(change.expectedAdditionalUserQuantity, 2);
    assert.equal(change.targetAdditionalUserQuantity, 3);

    assert.equal(change.estimatedAmountDue, 500n);
    assert.equal(change.monthlyTotalAmount, 32_900n);

    assert.deepEqual(
      change.stripeUpdateParameters,
      input.stripeUpdateParameters,
    );

    assert.equal(change.submittedAt, null);

    const billing = await readBilling();

    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activeUserCapacityChangeId, null);

    const found = await findBillingUserCapacityChange(
      organizationId,
      ownerId,
      change.id,
    );

    assert.equal(found?.id, change.id);
  });

  it("claims a change without granting its requested capacity", async () => {
    const preview = await createPreview();
    const result = await claim(preview.id);

    assert.equal(result.outcome, "submit");
    assert.equal(result.change.status, "PROCESSING");
    assert.ok(result.change.submittedAt);

    const billing = await readBilling();

    assert.equal(billing.activeUserCapacityChangeId, preview.id);
    assert.equal(billing.additionalUserQuantity, 2);
  });

  it("reuses the same operation and parameters on a processing retry", async () => {
    const preview = await createPreview();

    const first = await claim(preview.id);
    const second = await claim(preview.id);

    assert.equal(second.outcome, "submit");
    assert.equal(second.change.id, first.change.id);

    assert.equal(
      second.change.submittedAt?.getTime(),
      first.change.submittedAt?.getTime(),
    );

    assert.deepEqual(
      second.change.stripeUpdateParameters,
      first.change.stripeUpdateParameters,
    );

    assert.equal(
      await prisma.billingUserCapacityChange.count({
        where: {
          organizationBillingId: billingId,
        },
      }),
      1,
    );
  });

  it("allows only one of two concurrent changes to claim the subscription", async () => {
    const first = await createPreview();
    const second = await createPreview({
      targetAdditionalUserQuantity: 4,
      monthlyTotalAmount: 33_900n,
    });

    const results = await Promise.allSettled([
      claim(first.id),
      claim(second.id),
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
      "BILLING_CAPACITY_CHANGE_IN_PROGRESS",
    );

    const billing = await readBilling();

    assert.ok(
      billing.activeUserCapacityChangeId === first.id ||
      billing.activeUserCapacityChangeId === second.id,
    );
    assert.equal(billing.additionalUserQuantity, 2);
  });

  it("rejects an expired preview without claiming the subscription", async () => {
    const preview = await createPreview();

    await prisma.billingUserCapacityChange.update({
      where: { id: preview.id },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await assert.rejects(
      claim(preview.id),
      { code: "BILLING_CAPACITY_PREVIEW_EXPIRED" },
    );

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      null,
    );
  });

  it("rejects preview storage against a stale billing baseline", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        lastSyncedAt: new Date(baseline.getTime() + 1),
      },
    });

    await assert.rejects(
      createPreview(),
      { code: "BILLING_CAPACITY_STATE_CHANGED" },
    );

    assert.equal(
      await prisma.billingUserCapacityChange.count({
        where: {
          organizationBillingId: billingId,
        },
      }),
      0,
    );
  });

  it("rejects confirmation when billing changed after the preview", async () => {
    const preview = await createPreview();

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        lastSyncedAt: new Date(baseline.getTime() + 1),
      },
    });

    await assert.rejects(
      claim(preview.id),
      { code: "BILLING_CAPACITY_STATE_CHANGED" },
    );

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      null,
    );
  });

  it("does not expose or claim a change through another organization", async () => {
    const preview = await createPreview();
    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Other operation ${suffix}`,
        slug: `other-operation-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    assert.equal(
      await findBillingUserCapacityChange(
        other.id,
        ownerId,
        preview.id,
      ),
      null,
    );

    await assert.rejects(
      claimBillingUserCapacityChange(
        other.id,
        ownerId,
        preview.id,
      ),
      { code: "BILLING_CAPACITY_CHANGE_NOT_FOUND" },
    );
  });

  it("does not expose or claim another user's preview", async () => {
    const preview = await createPreview();
    const otherUser = await createUser();

    assert.equal(
      await findBillingUserCapacityChange(
        organizationId,
        otherUser.id,
        preview.id,
      ),
      null,
    );

    await assert.rejects(
      claimBillingUserCapacityChange(
        organizationId,
        otherUser.id,
        preview.id,
      ),
      { code: "BILLING_CAPACITY_CHANGE_NOT_FOUND" },
    );
  });

  it("blocks a reduction below active membership usage", async () => {
    // Owner plus ten members uses eleven slots.
    for (let index = 0; index < 10; index += 1) {
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

    const preview = await createPreview({
      targetAdditionalUserQuantity: 0,
      monthlyTotalAmount: 29_900n,
    });

    await assert.rejects(
      claim(preview.id),
      { code: "BILLING_CAPACITY_BELOW_USAGE" },
    );

    assert.equal(
      (await readBilling()).activeUserCapacityChangeId,
      null,
    );
  });

  it("includes pending invitations when checking a capacity reduction", async () => {
    for (let index = 0; index < 10; index += 1) {
      await prisma.membershipInvitation.create({
        data: {
          organizationId,
          invitedByMembershipId: ownerMembershipId,
          email: `operation-invite-${randomUUID()}@example.com`,
          role: "TECHNICIAN",
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }

    const preview = await createPreview({
      targetAdditionalUserQuantity: 0,
      monthlyTotalAmount: 29_900n,
    });

    await assert.rejects(
      claim(preview.id),
      { code: "BILLING_CAPACITY_BELOW_USAGE" },
    );
  });

  it("returns a pending-payment operation without submitting it again", async () => {
    const preview = await createPreview();

    await claim(preview.id);

    await prisma.billingUserCapacityChange.update({
      where: { id: preview.id },
      data: {
        status: "PENDING_PAYMENT",
      },
    });

    const result = await claim(preview.id);

    assert.equal(result.outcome, "pending_payment");
    assert.equal(result.change.id, preview.id);
    assert.equal((await readBilling()).additionalUserQuantity, 2);
  });

  it("blocks a processing retry outside the retry window", async () => {
    const preview = await createPreview();

    await claim(preview.id);

    await prisma.billingUserCapacityChange.update({
      where: { id: preview.id },
      data: {
        submittedAt: new Date(
          Date.now() - 24 * 60 * 60 * 1_000,
        ),
      },
    });

    await assert.rejects(
      claim(preview.id),
      { code: "BILLING_CAPACITY_RECONCILIATION_REQUIRED" },
    );

    const billing = await readBilling();

    assert.equal(billing.activeUserCapacityChangeId, preview.id);
    assert.equal(billing.additionalUserQuantity, 2);
  });

  it("returns an already-applied operation without claiming it again", async () => {
    const preview = await createPreview();

    await claim(preview.id);

    await prisma.$transaction(async (transaction) => {
      await transaction.organizationBilling.update({
        where: { organizationId },
        data: {
          additionalUserQuantity: 3,
          activeUserCapacityChangeId: null,
        },
      });

      await transaction.billingUserCapacityChange.update({
        where: { id: preview.id },
        data: {
          status: "APPLIED",
          appliedAt: new Date(),
        },
      });
    });

    const result = await claim(preview.id);

    assert.equal(result.outcome, "applied");
    assert.equal(result.change.id, preview.id);
    assert.equal(result.change.status, "APPLIED");

    const billing = await readBilling();

    assert.equal(billing.activeUserCapacityChangeId, null);
    assert.equal(billing.additionalUserQuantity, 3);
  });
});

//************************************************************** */