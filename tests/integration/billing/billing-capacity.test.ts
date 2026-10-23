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
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import {
  assertOrganizationUserCapacity,
} from "../../../src/modules/billing/billing-capacity.service.js";

import {
  getBillingPlan,
} from "../../../src/modules/billing/billing.constants.js";

//************************************************************** */

describe("Organization billing user capacity", () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  let organizationId: string;
  let ownerId: string;
  let ownerMembershipId: string;

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `capacity-${randomUUID()}@example.com`,
        firstName: "Capacity",
        lastName: "Test",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  async function createMember(
    status: MembershipStatus = MembershipStatus.ACTIVE,
    targetOrganizationId = organizationId,
  ) {
    const user = await createUser();

    const membership = await prisma.membership.create({
      data: {
        organizationId: targetOrganizationId,
        userId: user.id,
        role: "TECHNICIAN",
        status,
      },
    });

    return { user, membership };
  }

  async function createInvitation(
    options: {
      expiresAt?: Date;
      revokedAt?: Date;
    } = {},
  ) {
    return prisma.membershipInvitation.create({
      data: {
        organizationId,
        invitedByMembershipId: ownerMembershipId,
        email: `invited-${randomUUID()}@example.com`,
        role: "TECHNICIAN",
        tokenHash: randomUUID(),
        expiresAt:
          options.expiresAt ??
          new Date(Date.now() + 86_400_000),
        revokedAt: options.revokedAt ?? null,
      },
    });
  }

  function checkCapacity(excludeInvitationId?: string) {
    return prisma.$transaction(async (transaction) => {
      return assertOrganizationUserCapacity(
        transaction,
        organizationId,
        excludeInvitationId
          ? { excludeInvitationId }
          : {},
      );
    });
  }

  beforeEach(async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Capacity ${suffix}`,
        slug: `capacity-${suffix}`,
      },
    });

    organizationId = organization.id;
    organizationIds.push(organization.id);

    const owner = await createUser();
    ownerId = owner.id;

    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: owner.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    ownerMembershipId = membership.id;

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        planId: "starter",
        status: "TRIALING",
        currency: "usd",
        unitAmount: 8_900,
      },
    });
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

  for (const planId of ["starter", "business", "pro"] as const) {
    it(`enforces ${planId}'s included users and counts the owner`, async () => {
      const plan = getBillingPlan(planId);

      await prisma.organizationBilling.update({
        where: { organizationId },
        data: {
          planId,
          unitAmount: plan.unitAmount,
        },
      });

      // Leave exactly one slot available.
      for (let index = 0; index < plan.usersIncluded - 2; index += 1) {
        await createMember();
      }

      const available = await checkCapacity();

      assert.equal(available.userLimit, plan.usersIncluded);
      assert.equal(
        available.assignedUsers,
        plan.usersIncluded - 1,
      );

      await createMember();

      await assert.rejects(
        checkCapacity(),
        { code: "BILLING_USER_LIMIT_REACHED" },
      );
    });
  }

  it("allows twelve users on Pro with two purchased additional users", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        planId: "pro",
        status: "ACTIVE",
        unitAmount: 29_900,
        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: "price_capacity_additional",
        stripeAdditionalUserItemId: "si_capacity_additional",
      },
    });

    // Owner plus ten members uses eleven of twelve slots.
    for (let index = 0; index < 10; index += 1) {
      await createMember();
    }

    const available = await checkCapacity();

    assert.equal(available.userLimit, 12);
    assert.equal(available.assignedUsers, 11);

    await createMember();

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );
  });

  it("reserves capacity for an unexpired pending invitation", async () => {
    await createInvitation();

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );
  });

  it("does not reserve capacity for expired or revoked invitations", async () => {
    await createInvitation({
      expiresAt: new Date(Date.now() - 60_000),
    });

    await createInvitation({
      revokedAt: new Date(),
    });

    const result = await checkCapacity();

    assert.equal(result.assignedUsers, 1);
    assert.equal(result.pendingInvitations, 0);
    assert.equal(result.userLimit, 2);
  });

  it("allows an invitation reservation to be replaced by membership", async () => {
    const invitation = await createInvitation();

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );

    const invitedUser = await createUser();

    await prisma.$transaction(async (transaction) => {
      const current = await transaction.membershipInvitation.findFirst({
        where: {
          id: invitation.id,
          organizationId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      assert.ok(current);

      await assertOrganizationUserCapacity(
        transaction,
        organizationId,
        { excludeInvitationId: invitation.id },
      );

      await transaction.membership.create({
        data: {
          organizationId,
          userId: invitedUser.id,
          role: current.role,
          status: "ACTIVE",
        },
      });

      await transaction.membershipInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
    });

    assert.equal(
      await prisma.membership.count({
        where: {
          organizationId,
          status: "ACTIVE",
        },
      }),
      2,
    );

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );
  });

  it("reserves capacity for an invited membership", async () => {
    await createMember(MembershipStatus.INVITED);

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );
  });

  it("allows an exempt owner's organization without a subscription", async () => {
    await prisma.platformAdmin.create({
      data: {
        userId: ownerId,
        role: "SUPER_ADMIN",
        billingExempt: true,
      },
    });

    await prisma.organizationBilling.delete({
      where: { organizationId },
    });

    await createMember();
    await createMember();

    const result = await checkCapacity();

    assert.equal(result.billingExempt, true);
    assert.equal(result.userLimit, null);
    assert.equal(result.assignedUsers, 3);
  });

  it("does not exempt an organization because an ordinary member has a platform grant", async () => {
    const { user } = await createMember();

    await prisma.platformAdmin.create({
      data: {
        userId: user.id,
        role: "SUPER_ADMIN",
        billingExempt: true,
      },
    });

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );
  });

  it("requires a subscription before adding users to a non-exempt organization", async () => {
    await prisma.organizationBilling.delete({
      where: { organizationId },
    });

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_SUBSCRIPTION_REQUIRED" },
    );
  });

  it("rejects additional users stored against Starter", async () => {
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        additionalUserQuantity: 1,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: "price_invalid_additional",
        stripeAdditionalUserItemId: "si_invalid_additional",
      },
    });

    await assert.rejects(
      checkCapacity(),
      { code: "BILLING_PLAN_CONFIGURATION_INVALID" },
    );
  });

  it("allows only one concurrent request to consume Starter's last slot", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();

    function addUser(userId: string) {
      return prisma.$transaction(async (transaction) => {
        await assertOrganizationUserCapacity(
          transaction,
          organizationId,
        );

        return transaction.membership.create({
          data: {
            organizationId,
            userId,
            role: "TECHNICIAN",
            status: "ACTIVE",
          },
        });
      });
    }

    const results = await Promise.allSettled([
      addUser(firstUser.id),
      addUser(secondUser.id),
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
      "BILLING_USER_LIMIT_REACHED",
    );

    assert.equal(
      await prisma.membership.count({
        where: {
          organizationId,
          status: "ACTIVE",
        },
      }),
      2,
    );
  });

  it("ignores memberships belonging to another organization", async () => {
    const suffix = randomUUID();

    const otherOrganization = await prisma.organization.create({
      data: {
        name: `Other capacity ${suffix}`,
        slug: `other-capacity-${suffix}`,
      },
    });

    organizationIds.push(otherOrganization.id);

    await createMember(
      MembershipStatus.ACTIVE,
      otherOrganization.id,
    );

    await createMember(
      MembershipStatus.INVITED,
      otherOrganization.id,
    );

    const result = await checkCapacity();

    assert.equal(result.assignedUsers, 1);
    assert.equal(result.reservedMemberships, 0);
    assert.equal(result.pendingInvitations, 0);
    assert.equal(result.userLimit, 2);
  });

  it("rejects an unknown organization", async () => {
    await assert.rejects(
      prisma.$transaction(async (transaction) => {
        await assertOrganizationUserCapacity(
          transaction,
          `missing_${randomUUID()}`,
        );
      }),
      { code: "ORGANIZATION_NOT_FOUND" },
    );
  });
});

//************************************************************** */