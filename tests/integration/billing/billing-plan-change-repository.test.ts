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
  findBillingPlanChange,
  type BillingPlanChangePreviewData,
} from "../../../src/modules/billing/billing-plan-change.repository.js";

//************************************************************** */

describe("Billing plan-change repository", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  let organizationId: string;
  let billingId: string;
  let ownerId: string;
  let ownerMembershipId: string;
  let customerId: string;
  let subscriptionId: string;
  let priceId: string;
  let baseline: Date;

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `plan-change-${randomUUID()}@example.com`,
        firstName: "Plan",
        lastName: "Change",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  function previewData(
    overrides: Partial<BillingPlanChangePreviewData> = {},
  ): BillingPlanChangePreviewData {
    return {
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
            id: "si_plan_change_base",
            price: "price_plan_change_business",
            quantity: 1,
          },
          {
            id: "si_plan_change_additional",
            deleted: true,
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
    overrides: Partial<BillingPlanChangePreviewData> = {},
  ) {
    return createBillingPlanChangePreview(
      organizationId,
      ownerId,
      previewData(overrides),
    );
  }

  function claim(changeId: string) {
    return claimBillingPlanChange(
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

  async function addMembership(
    status: "ACTIVE" | "INVITED",
  ) {
    const user = await createUser();

    return prisma.membership.create({
      data: {
        organizationId,
        userId: user.id,
        role: "TECHNICIAN",
        status,
      },
    });
  }

  async function addInvitation(expired = false) {
    return prisma.membershipInvitation.create({
      data: {
        organizationId,
        invitedByMembershipId: ownerMembershipId,
        email: `plan-invitation-${randomUUID()}@example.com`,
        role: "TECHNICIAN",
        tokenHash: randomUUID(),

        expiresAt: new Date(
          Date.now() + (expired ? -86_400_000 : 86_400_000),
        ),
      },
    });
  }

  beforeEach(async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Plan change ${suffix}`,
        slug: `plan-change-${suffix}`,
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
    customerId = `cus_plan_change_${suffix}`;
    subscriptionId = `sub_plan_change_${suffix}`;
    priceId = `price_plan_change_pro_${suffix}`;
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
        stripeAdditionalUserPriceId: `price_additional_${suffix}`,
        stripeAdditionalUserItemId: "si_plan_change_additional",

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

  it("stores a preview without changing the subscription or claiming it", async () => {
    const input = previewData();

    const change = await createBillingPlanChangePreview(
      organizationId,
      ownerId,
      input,
    );

    assert.equal(change.status, "QUOTED");
    assert.equal(change.requestedByUserId, ownerId);
    assert.equal(change.organizationBillingId, billingId);
    assert.equal(change.expectedPlanId, "pro");
    assert.equal(change.targetPlanId, "business");
    assert.equal(change.expectedAdditionalUserQuantity, 2);
    assert.equal(change.targetAdditionalUserQuantity, 0);
    assert.equal(change.monthlyTotalAmount, 18_900n);
    assert.equal(change.submittedAt, null);

    assert.deepEqual(
      change.stripeUpdateParameters,
      input.stripeUpdateParameters,
    );

    const billing = await readBilling();

    assert.equal(billing.planId, "pro");
    assert.equal(billing.additionalUserQuantity, 2);
    assert.equal(billing.activePlanChangeId, null);

    assert.equal(
      (await findBillingPlanChange(
        organizationId,
        ownerId,
        change.id,
      ))?.id,
      change.id,
    );
  });

  it("claims a change without applying the target plan or capacity", async () => {
    const preview = await createPreview();
    const result = await claim(preview.id);

    assert.equal(result.outcome, "submit");
    assert.equal(result.change.status, "PROCESSING");
    assert.ok(result.change.submittedAt);

    const billing = await readBilling();

    assert.equal(billing.activePlanChangeId, preview.id);
    assert.equal(billing.planId, "pro");
    assert.equal(billing.additionalUserQuantity, 2);
  });

  it("preserves parameters and submission time on a processing retry", async () => {
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
      await prisma.billingPlanChange.count({
        where: { organizationBillingId: billingId },
      }),
      1,
    );
  });

  it("allows only one concurrent plan change to claim the subscription", async () => {
    const first = await createPreview();
    const second = await createPreview();

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
      "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    );

    const billing = await readBilling();

    assert.ok(
      billing.activePlanChangeId === first.id ||
      billing.activePlanChangeId === second.id,
    );
  });

  it("rejects an expired preview without claiming it", async () => {
    const preview = await createPreview();

    await prisma.billingPlanChange.update({
      where: { id: preview.id },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await assert.rejects(claim(preview.id), {
      code: "BILLING_PLAN_PREVIEW_EXPIRED",
    });

    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("rejects preview storage against a stale billing baseline", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        lastSyncedAt: new Date(baseline.getTime() + 1),
      },
    });

    await assert.rejects(createPreview(), {
      code: "BILLING_PLAN_STATE_CHANGED",
    });

    assert.equal(
      await prisma.billingPlanChange.count({
        where: { organizationBillingId: billingId },
      }),
      0,
    );
  });

  it("rejects confirmation when synchronization changed after preview", async () => {
    const preview = await createPreview();

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        lastSyncedAt: new Date(baseline.getTime() + 1),
      },
    });

    await assert.rejects(claim(preview.id), {
      code: "BILLING_PLAN_STATE_CHANGED",
    });

    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("does not expose or claim another organization's preview", async () => {
    const preview = await createPreview();
    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Other plan change ${suffix}`,
        slug: `other-plan-change-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    assert.equal(
      await findBillingPlanChange(other.id, ownerId, preview.id),
      null,
    );

    await assert.rejects(
      claimBillingPlanChange(other.id, ownerId, preview.id),
      { code: "BILLING_PLAN_CHANGE_NOT_FOUND" },
    );
  });

  it("does not expose or claim another user's preview", async () => {
    const preview = await createPreview();
    const other = await createUser();

    assert.equal(
      await findBillingPlanChange(
        organizationId,
        other.id,
        preview.id,
      ),
      null,
    );

    await assert.rejects(
      claimBillingPlanChange(
        organizationId,
        other.id,
        preview.id,
      ),
      { code: "BILLING_PLAN_CHANGE_NOT_FOUND" },
    );
  });

  it("blocks a downgrade below active membership usage", async () => {
    const preview = await createPreview();

    // Added after preview: owner plus five users exceeds Business.
    for (let index = 0; index < 5; index += 1) {
      await addMembership("ACTIVE");
    }

    await assert.rejects(claim(preview.id), {
      code: "BILLING_PLAN_CAPACITY_BELOW_USAGE",
    });

    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("includes invited memberships when checking target capacity", async () => {
    const preview = await createPreview();

    for (let index = 0; index < 5; index += 1) {
      await addMembership("INVITED");
    }

    await assert.rejects(claim(preview.id), {
      code: "BILLING_PLAN_CAPACITY_BELOW_USAGE",
    });
  });

  it("includes pending invitations when checking target capacity", async () => {
    const preview = await createPreview();

    for (let index = 0; index < 5; index += 1) {
      await addInvitation();
    }

    await assert.rejects(claim(preview.id), {
      code: "BILLING_PLAN_CAPACITY_BELOW_USAGE",
    });
  });

  it("allows exact target capacity and ignores expired invitations", async () => {
    for (let index = 0; index < 4; index += 1) {
      await addMembership("ACTIVE");
    }

    await addInvitation(true);

    const preview = await createPreview();
    const result = await claim(preview.id);

    assert.equal(result.outcome, "submit");
  });

  it("blocks previews and claims while a capacity change is active", async () => {
    const preview = await createPreview();

    const capacityChange =
      await prisma.billingUserCapacityChange.create({
        data: {
          organizationBillingId: billingId,
          requestedByUserId: ownerId,
          status: "PROCESSING",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          expectedAdditionalUserQuantity: 2,
          targetAdditionalUserQuantity: 3,
          expectedLastSyncedAt: baseline,
          prorationDate: Math.floor(Date.now() / 1_000),
          currency: "usd",
          estimatedAmountDue: 500n,
          monthlyTotalAmount: 32_900n,
          stripeUpdateParameters: {},
          expiresAt: new Date(Date.now() + 600_000),
          submittedAt: new Date(),
        },
      });

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        activeUserCapacityChangeId: capacityChange.id,
      },
    });

    await assert.rejects(createPreview(), {
      code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    });

    await assert.rejects(claim(preview.id), {
      code: "BILLING_SUBSCRIPTION_CHANGE_PENDING",
    });

    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("returns pending payment without resubmitting the operation", async () => {
    const preview = await createPreview();
    await claim(preview.id);

    await prisma.billingPlanChange.update({
      where: { id: preview.id },
      data: {
        status: "PENDING_PAYMENT",
      },
    });

    const result = await claim(preview.id);

    assert.equal(result.outcome, "pending_payment");
    assert.equal(result.change.id, preview.id);
    assert.equal((await readBilling()).planId, "pro");
  });

  it("retains the claim when a processing retry is too old", async () => {
    const preview = await createPreview();
    await claim(preview.id);

    await prisma.billingPlanChange.update({
      where: { id: preview.id },
      data: {
        submittedAt: new Date(
          Date.now() - 24 * 60 * 60 * 1_000,
        ),
      },
    });

    await assert.rejects(claim(preview.id), {
      code: "BILLING_PLAN_RECONCILIATION_REQUIRED",
    });

    assert.equal(
      (await readBilling()).activePlanChangeId,
      preview.id,
    );
  });

  it("returns an applied operation without claiming it again", async () => {
    const preview = await createPreview();
    await claim(preview.id);

    await prisma.$transaction(async (transaction) => {
      await transaction.organizationBilling.update({
        where: { organizationId },
        data: {
          planId: "business",
          stripePriceId: "price_plan_change_business",
          unitAmount: 18_900,
          additionalUserQuantity: 0,
          additionalUserUnitAmount: null,
          stripeAdditionalUserPriceId: null,
          stripeAdditionalUserItemId: null,
          activePlanChangeId: null,
        },
      });

      await transaction.billingPlanChange.update({
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
    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("rejects invalid target terms and client-like pricing overrides", async () => {
    const invalidTerms: Partial<BillingPlanChangePreviewData>[] = [
      { targetPlanId: "enterprise" },
      {
        targetPlanId: "pro",
        targetAdditionalUserQuantity: 2,
        monthlyTotalAmount: 31_900n,
      },
      { targetAdditionalUserQuantity: 1 },
      { expectedAdditionalUserQuantity: -1 },
      { currency: "eur" },
      { estimatedAmountDue: -1n },
      { monthlyTotalAmount: 1n },
    ];

    for (const overrides of invalidTerms) {
      await assert.rejects(createPreview(overrides), {
        code: "BILLING_PLAN_PREVIEW_REQUIRED",
      });
    }

    assert.equal(
      await prisma.billingPlanChange.count({
        where: { organizationBillingId: billingId },
      }),
      0,
    );
  });

  it("rejects confirmation after the organization is archived", async () => {
    const preview = await createPreview();

    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: "ARCHIVED" },
    });

    await assert.rejects(claim(preview.id), {
      code: "ORGANIZATION_NOT_FOUND",
    });

    assert.equal((await readBilling()).activePlanChangeId, null);
  });

  it("rejects a cancellation scheduled after preview", async () => {
    const preview = await createPreview();

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { cancelAtPeriodEnd: true },
    });

    await assert.rejects(claim(preview.id), {
      code: "BILLING_CANCELLATION_SCHEDULED",
    });

    assert.equal((await readBilling()).activePlanChangeId, null);
  });
});

//************************************************************** */