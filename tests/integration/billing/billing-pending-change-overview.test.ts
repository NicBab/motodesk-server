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
import { getStripeClient } from "../../../src/config/stripe.js";

import type {
  BillingPlanChangeStatus,
} from "../../../src/generated/prisma/client.js";

import {
  getOrganizationBillingOverview,
} from "../../../src/modules/billing/billing-overview.service.js";

import {
  lockOrganizationUserCapacity,
} from "../../../src/modules/billing/billing-capacity.service.js";

import {
  Permissions,
} from "../../../src/modules/permissions/permission.constants.js";

//************************************************************** */

describe("Pending billing changes in organization overview", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  let organizationId: string;
  let billingId: string;
  let ownerId: string;
  let viewerId: string;
  let viewerMembershipId: string;
  let customerId: string;
  let subscriptionId: string;
  let submittedAt: Date;
  let stripeCalls: number;

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `pending-overview-${label}-${randomUUID()}@example.com`,
        firstName: "Pending",
        lastName: label,
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);
    return user;
  }

  async function seedPlanChange(
    status: BillingPlanChangeStatus = "PROCESSING",
  ) {
    const change = await prisma.billingPlanChange.create({
      data: {
        organizationBillingId: billingId,
        requestedByUserId: ownerId,
        status,

        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        expectedStripePriceId: "price_pending_overview_pro",

        expectedPlanId: "pro",
        targetPlanId: "business",
        expectedAdditionalUserQuantity: 2,
        targetAdditionalUserQuantity: 0,

        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",
        estimatedAmountDue: 500n,
        monthlyTotalAmount: 18_900n,

        // This private value must never be serialized publicly.
        stripeUpdateParameters: {
          privateMarker: "private_pending_request_marker",
        },

        stripeInvoiceId: "in_pending_overview",
        lastErrorCode: "INTERNAL_PENDING_DIAGNOSTIC",

        expiresAt: new Date(Date.now() + 600_000),
        submittedAt,
      },
    });

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { activePlanChangeId: change.id },
    });

    return change;
  }

  function overview(actorId = ownerId) {
    return getOrganizationBillingOverview(
      organizationId,
      actorId,
    );
  }

  beforeEach(async () => {
    stripeCalls = 0;
    submittedAt = new Date(Date.now() - 30_000);

    const stripe = getStripeClient();

    function unexpectedStripeCall(): never {
      stripeCalls += 1;
      throw new Error("Overview must not contact Stripe.");
    }

    mock.method(stripe.customers, "retrieve", unexpectedStripeCall);
    mock.method(stripe.subscriptions, "retrieve", unexpectedStripeCall);
    mock.method(stripe.subscriptions, "list", unexpectedStripeCall);
    mock.method(stripe.subscriptions, "update", unexpectedStripeCall);
    mock.method(stripe.invoices, "retrieve", unexpectedStripeCall);

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Pending overview ${suffix}`,
        slug: `pending-overview-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organizationId);

    const owner = await createUser("owner");
    const viewer = await createUser("viewer");

    ownerId = owner.id;
    viewerId = viewer.id;

    await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const viewerMembership = await prisma.membership.create({
      data: {
        organizationId,
        userId: viewerId,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });

    viewerMembershipId = viewerMembership.id;

    await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: viewerMembershipId,
        permission: Permissions.BILLING_VIEW,
      },
    });

    customerId = `cus_pending_overview_${suffix}`;
    subscriptionId = `sub_pending_overview_${suffix}`;

    const billing = await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_pending_overview_pro",

        planId: "pro",
        status: "ACTIVE",
        currency: "usd",
        unitAmount: 29_900,

        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: "price_pending_overview_additional",
        stripeAdditionalUserItemId: "si_pending_overview_additional",
      },
    });

    billingId = billing.id;
  });

  afterEach(async () => {
    const calls = stripeCalls;
    mock.restoreAll();

    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });

    organizationIds.length = 0;
    userIds.length = 0;

    assert.equal(calls, 0);
  });

  it("returns null when no operation is active", async () => {
    assert.equal((await overview()).pendingChange, null);
  });

  for (const status of [
    "PROCESSING",
    "PENDING_PAYMENT",
    "RECONCILIATION_REQUIRED",
  ] as const) {
    it(`returns a safe plan-change projection for ${status}`, async () => {
      const change = await seedPlanChange(status);
      const result = await overview();

      assert.deepEqual(result.pendingChange, {
        kind: "PLAN_CHANGE",
        changeId: change.id,
        requestedByCurrentUser: true,
        status,
        targetPlanId: "business",
        targetAdditionalUserQuantity: 0,
        targetUserLimit: 5,
        currency: "usd",
        monthlyTotalAmount: 18_900,
        submittedAt: submittedAt.toISOString(),
      });

      // Current subscription remains separate from its pending target.
      assert.equal(result.subscription.plan?.id, "pro");
      assert.equal(result.usage.userLimit, 12);
      assert.equal(result.subscription.monthlyTotalAmount, 31_900);
    });
  }

  it("returns pending additional-user purchases through the same response field", async () => {
    const change = await prisma.billingUserCapacityChange.create({
      data: {
        organizationBillingId: billingId,
        requestedByUserId: ownerId,
        status: "PENDING_PAYMENT",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,

        expectedAdditionalUserQuantity: 2,
        targetAdditionalUserQuantity: 3,

        prorationDate: Math.floor(Date.now() / 1_000),
        currency: "usd",
        estimatedAmountDue: 500n,
        monthlyTotalAmount: 32_900n,

        stripeUpdateParameters: {},
        expiresAt: new Date(Date.now() + 600_000),
        submittedAt,
      },
    });

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { activeUserCapacityChangeId: change.id },
    });

    const result = await overview();

    assert.equal(result.pendingChange?.kind, "USER_CAPACITY_CHANGE");
    assert.equal(result.pendingChange?.changeId, change.id);
    assert.equal(result.pendingChange?.targetPlanId, "pro");
    assert.equal(result.pendingChange?.targetUserLimit, 13);
    assert.equal(result.pendingChange?.monthlyTotalAmount, 32_900);
    assert.equal(result.usage.userLimit, 12);
  });

  it("hides the confirmation ID from other viewers even if they can manage billing", async () => {
    await seedPlanChange();

    const viewerResult = await overview(viewerId);

    assert.equal(viewerResult.pendingChange?.changeId, null);
    assert.equal(viewerResult.pendingChange?.requestedByCurrentUser, false);
    assert.equal(viewerResult.pendingChange?.targetPlanId, "business");

    await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: viewerMembershipId,
        permission: Permissions.BILLING_UPDATE,
      },
    });

    const managerResult = await overview(viewerId);

    assert.equal(managerResult.pendingChange?.changeId, null);
    assert.equal(managerResult.pendingChange?.requestedByCurrentUser, false);
  });

  it("does not expose Stripe identifiers, requester IDs, or private operation data", async () => {
    await seedPlanChange();

    const result = await overview();
    const serialized = JSON.stringify(result);

    for (const privateValue of [
      customerId,
      subscriptionId,
      ownerId,
      billingId,
      "price_pending_overview_pro",
      "price_pending_overview_additional",
      "si_pending_overview_additional",
      "in_pending_overview",
      "private_pending_request_marker",
      "INTERNAL_PENDING_DIAGNOSTIC",
    ]) {
      assert.equal(
        serialized.includes(privateValue),
        false,
        `Overview leaked: ${privateValue}`,
      );
    }
  });

  it("returns null after an operation is completed and its pointer cleared", async () => {
    const change = await seedPlanChange();

    await prisma.$transaction(async (transaction) => {
      await lockOrganizationUserCapacity(transaction, organizationId);

      await transaction.billingPlanChange.update({
        where: { id: change.id },
        data: {
          status: "APPLIED",
          appliedAt: new Date(),
        },
      });

      await transaction.organizationBilling.update({
        where: { organizationId },
        data: {
          planId: "business",
          unitAmount: 18_900,
          stripePriceId: "price_pending_overview_business",
          additionalUserQuantity: 0,
          additionalUserUnitAmount: null,
          stripeAdditionalUserPriceId: null,
          stripeAdditionalUserItemId: null,
          activePlanChangeId: null,
        },
      });
    });

    const result = await overview();

    assert.equal(result.pendingChange, null);
    assert.equal(result.subscription.plan?.id, "business");
    assert.equal(result.usage.userLimit, 5);
  });

  it("does not expose pending changes through another organization", async () => {
    await seedPlanChange();

    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Other pending overview ${suffix}`,
        slug: `other-pending-overview-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    await assert.rejects(
      getOrganizationBillingOverview(other.id, ownerId),
      { code: "ORGANIZATION_NOT_FOUND" },
    );
  });

  it("rejects an operation pointer referencing another billing record", async () => {
    const change = await seedPlanChange();
    const suffix = randomUUID();

    const other = await prisma.organization.create({
      data: {
        name: `Foreign pending pointer ${suffix}`,
        slug: `foreign-pending-pointer-${suffix}`,
      },
    });

    organizationIds.push(other.id);

    const otherBilling = await prisma.organizationBilling.create({
      data: { organizationId: other.id },
    });

    await prisma.billingPlanChange.update({
      where: { id: change.id },
      data: { organizationBillingId: otherBilling.id },
    });

    await assert.rejects(overview(), {
      code: "BILLING_PLAN_CONFIGURATION_INVALID",
    });
  });

  it("rejects simultaneous active operation pointers", async () => {
    await seedPlanChange();

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { activeUserCapacityChangeId: randomUUID() },
    });

    await assert.rejects(overview(), {
      code: "BILLING_PLAN_CONFIGURATION_INVALID",
    });
  });

  it("rejects inconsistent pending prices instead of displaying them", async () => {
    const change = await seedPlanChange();

    await prisma.billingPlanChange.update({
      where: { id: change.id },
      data: { monthlyTotalAmount: 1n },
    });

    await assert.rejects(overview(), {
      code: "BILLING_PLAN_CONFIGURATION_INVALID",
    });
  });

  it("reads a consistent state while an operation completes concurrently", async () => {
    const change = await seedPlanChange();

    const [result] = await Promise.all([
      overview(),

      prisma.$transaction(async (transaction) => {
        await lockOrganizationUserCapacity(transaction, organizationId);

        await transaction.billingPlanChange.update({
          where: { id: change.id },
          data: {
            status: "APPLIED",
            appliedAt: new Date(),
          },
        });

        await transaction.organizationBilling.update({
          where: { organizationId },
          data: {
            planId: "business",
            stripePriceId: "price_pending_overview_business",
            unitAmount: 18_900,
            additionalUserQuantity: 0,
            additionalUserUnitAmount: null,
            stripeAdditionalUserPriceId: null,
            stripeAdditionalUserItemId: null,
            activePlanChangeId: null,
          },
        });
      }),
    ]);

    if (result.pendingChange) {
      assert.equal(result.pendingChange.status, "PROCESSING");
      assert.equal(result.subscription.plan?.id, "pro");
    } else {
      assert.equal(result.subscription.plan?.id, "business");
    }
  });

  it("rejects a terminal operation whose active pointer remains set", async () => {
    await seedPlanChange("APPLIED");

    await assert.rejects(overview(), {
      code: "BILLING_PLAN_CONFIGURATION_INVALID",
    });
  });
});

//************************************************************** */