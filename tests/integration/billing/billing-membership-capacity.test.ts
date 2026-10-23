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
  Permissions,
} from "../../../src/modules/permissions/permission.constants.js";

import {
  createMembershipWithPermissions,
  removeMembershipRecord,
  updateMembershipRecord,
  updateMembershipRoleAndPermissions,
} from "../../../src/modules/memberships/membership.repository.js";

//************************************************************** */

describe("Membership repository billing capacity", () => {
  const userIds: string[] = [];

  let organizationId: string;
  let ownerId: string;
  let ownerMembershipId: string;

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `membership-capacity-${randomUUID()}@example.com`,
        firstName: "Membership",
        lastName: "Capacity",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  async function seedMember(
    status: MembershipStatus = MembershipStatus.ACTIVE,
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

  function addUser(userId: string) {
    return createMembershipWithPermissions(
      organizationId,
      userId,
      "TECHNICIAN",
      [Permissions.BILLING_VIEW],
      ownerMembershipId,
    );
  }

  function activeCount() {
    return prisma.membership.count({
      where: {
        organizationId,
        status: "ACTIVE",
      },
    });
  }

  beforeEach(async () => {
    organizationId = "";

    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Membership capacity ${suffix}`,
        slug: `membership-capacity-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await createUser();
    ownerId = owner.id;

    const ownerMembership = await prisma.membership.create({
      data: {
        organizationId,
        userId: owner.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    ownerMembershipId = ownerMembership.id;

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

  it("creates a membership and its permissions in the available slot", async () => {
    const user = await createUser();
    const membership = await addUser(user.id);

    assert.equal(membership.organizationId, organizationId);
    assert.equal(membership.userId, user.id);
    assert.equal(membership.status, "ACTIVE");
    assert.equal(await activeCount(), 2);

    const permissions = await prisma.membershipPermission.findMany({
      where: {
        organizationId,
        membershipId: membership.id,
      },
    });

    assert.equal(permissions.length, 1);
    assert.equal(
      permissions[0]!.permission,
      Permissions.BILLING_VIEW,
    );
    assert.equal(
      permissions[0]!.grantedByMembershipId,
      ownerMembershipId,
    );
  });

  it("blocks an additional membership without leaving partial records", async () => {
    await seedMember();

    const user = await createUser();

    await assert.rejects(
      addUser(user.id),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );

    assert.equal(await activeCount(), 2);

    assert.equal(
      await prisma.membership.count({
        where: {
          organizationId,
          userId: user.id,
        },
      }),
      0,
    );

    assert.equal(
      await prisma.membershipPermission.count({
        where: { organizationId },
      }),
      0,
    );
  });

  it("allows only one concurrent membership to consume the last slot", async () => {
    const first = await createUser();
    const second = await createUser();

    const results = await Promise.allSettled([
      addUser(first.id),
      addUser(second.id),
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

    assert.equal(await activeCount(), 2);

    assert.equal(
      await prisma.membershipPermission.count({
        where: { organizationId },
      }),
      1,
    );
  });

  it("reactivates a suspended membership when a slot is available", async () => {
    const membership = await seedMember(
      MembershipStatus.SUSPENDED,
    );

    const result = await updateMembershipRecord(
      membership.id,
      { status: MembershipStatus.ACTIVE },
    );

    assert.equal(result.status, "ACTIVE");
    assert.equal(await activeCount(), 2);
  });

  it("blocks reactivation when all slots are occupied", async () => {
    await seedMember();

    const suspended = await seedMember(
      MembershipStatus.SUSPENDED,
    );

    await assert.rejects(
      updateMembershipRecord(
        suspended.id,
        { status: MembershipStatus.ACTIVE },
      ),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );

    const unchanged = await prisma.membership.findUniqueOrThrow({
      where: { id: suspended.id },
    });

    assert.equal(unchanged.status, "SUSPENDED");
    assert.equal(await activeCount(), 2);
  });

  it("activates an invited membership without counting its reservation twice", async () => {
    const invited = await seedMember(
      MembershipStatus.INVITED,
    );

    const result = await updateMembershipRecord(
      invited.id,
      { status: MembershipStatus.ACTIVE },
    );

    assert.equal(result.status, "ACTIVE");
    assert.equal(await activeCount(), 2);
  });

  it("allows an already-active membership update at the user limit", async () => {
    const membership = await seedMember();

    const result = await updateMembershipRecord(
      membership.id,
      { status: MembershipStatus.ACTIVE },
    );

    assert.equal(result.status, "ACTIVE");
    assert.equal(await activeCount(), 2);
  });

  it("preserves role and permissions when combined activation exceeds capacity", async () => {
    await seedMember();

    const suspended = await seedMember(
      MembershipStatus.SUSPENDED,
    );

    await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: suspended.id,
        permission: Permissions.BILLING_VIEW,
        grantedByMembershipId: ownerMembershipId,
      },
    });

    await assert.rejects(
      updateMembershipRoleAndPermissions(
        organizationId,
        suspended.id,
        {
          role: "MANAGER",
          status: MembershipStatus.ACTIVE,
        },
        [Permissions.BILLING_UPDATE],
        ownerMembershipId,
      ),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );

    const unchanged = await prisma.membership.findUniqueOrThrow({
      where: { id: suspended.id },
    });

    assert.equal(unchanged.role, "TECHNICIAN");
    assert.equal(unchanged.status, "SUSPENDED");

    const permissions = await prisma.membershipPermission.findMany({
      where: {
        organizationId,
        membershipId: suspended.id,
      },
    });

    assert.equal(permissions.length, 1);
    assert.equal(
      permissions[0]!.permission,
      Permissions.BILLING_VIEW,
    );
  });

  it("allows role and permission changes at the user limit", async () => {
    const membership = await seedMember();

    const result = await updateMembershipRoleAndPermissions(
      organizationId,
      membership.id,
      { role: "MANAGER" },
      [Permissions.BILLING_VIEW],
      ownerMembershipId,
    );

    assert.equal(result.role, "MANAGER");
    assert.equal(result.status, "ACTIVE");
    assert.equal(await activeCount(), 2);

    assert.equal(
      await prisma.membershipPermission.count({
        where: {
          organizationId,
          membershipId: membership.id,
          permission: Permissions.BILLING_VIEW,
        },
      }),
      1,
    );
  });

  it("frees capacity when a member is removed", async () => {
    const membership = await seedMember();

    await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: membership.id,
        permission: Permissions.BILLING_VIEW,
        grantedByMembershipId: ownerMembershipId,
      },
    });

    const removed = await removeMembershipRecord(
      organizationId,
      membership.id,
    );

    assert.equal(removed.status, "REMOVED");

    assert.equal(
      await prisma.membershipPermission.count({
        where: {
          organizationId,
          membershipId: membership.id,
        },
      }),
      0,
    );

    const replacement = await createUser();
    await addUser(replacement.id);

    assert.equal(await activeCount(), 2);
  });

  it("requires an existing pending invitation to be resolved before direct membership creation", async () => {
    const user = await createUser();

    await prisma.membershipInvitation.create({
      data: {
        organizationId,
        invitedByMembershipId: ownerMembershipId,
        email: user.email,
        role: "TECHNICIAN",
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await assert.rejects(
      addUser(user.id),
      { code: "MEMBERSHIP_INVITATION_ALREADY_EXISTS" },
    );

    assert.equal(await activeCount(), 1);

    assert.equal(
      await prisma.membership.count({
        where: {
          organizationId,
          userId: user.id,
        },
      }),
      0,
    );
  });

  it("allows an exempt owner's organization to add users without a subscription", async () => {
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

    await seedMember();

    const user = await createUser();
    const membership = await addUser(user.id);

    assert.equal(membership.status, "ACTIVE");
    assert.equal(await activeCount(), 3);
  });

  it("enforces purchased additional-user capacity on Pro", async () => {
    const suffix = randomUUID();

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        planId: "pro",
        status: "ACTIVE",
        unitAmount: 29_900,
        additionalUserQuantity: 2,
        additionalUserUnitAmount: 1_000,
        stripeAdditionalUserPriceId: `price_additional_${suffix}`,
        stripeAdditionalUserItemId: `si_additional_${suffix}`,
      },
    });

    // Owner plus ten members leaves one of twelve slots.
    for (let index = 0; index < 10; index += 1) {
      await seedMember();
    }

    const twelfthUser = await createUser();
    await addUser(twelfthUser.id);

    assert.equal(await activeCount(), 12);

    const thirteenthUser = await createUser();

    await assert.rejects(
      addUser(thirteenthUser.id),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );

    assert.equal(await activeCount(), 12);
  });
});

//************************************************************** */