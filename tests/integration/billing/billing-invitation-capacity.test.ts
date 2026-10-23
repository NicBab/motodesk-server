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
  Permissions,
} from "../../../src/modules/permissions/permission.constants.js";

import {
  acceptMembershipInvitationRecord,
  createMembershipInvitationRecord,
  refreshMembershipInvitationRecord,
  revokeMembershipInvitationRecord,
} from "../../../src/modules/membership-invitations/membership-invitation.repository.js";

import {
  createMembershipWithPermissions,
} from "../../../src/modules/memberships/membership.repository.js";

//************************************************************** */

describe("Invitation repository billing capacity", () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  let organizationId: string;
  let ownerId: string;
  let ownerMembershipId: string;

  function futureDate() {
    return new Date(Date.now() + 86_400_000);
  }

  function uniqueEmail() {
    return `invitation-capacity-${randomUUID()}@example.com`;
  }

  async function createUser(email = uniqueEmail()) {
    const user = await prisma.user.create({
      data: {
        email,
        firstName: "Invitation",
        lastName: "Capacity",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  function createInvitation(email = uniqueEmail()) {
    return createMembershipInvitationRecord(
      organizationId,
      ownerMembershipId,
      email,
      "TECHNICIAN",
      randomUUID(),
      futureDate(),
    );
  }

  function acceptInvitation(
    invitationId: string,
    userId: string,
    targetOrganizationId = organizationId,
  ) {
    return acceptMembershipInvitationRecord(
      invitationId,
      targetOrganizationId,
      userId,
      "TECHNICIAN",
      [Permissions.BILLING_VIEW],
      ownerMembershipId,
    );
  }

  async function seedExpiredInvitation() {
    return prisma.membershipInvitation.create({
      data: {
        organizationId,
        invitedByMembershipId: ownerMembershipId,
        email: uniqueEmail(),
        role: "TECHNICIAN",
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
  }

  async function seedActiveMember() {
    const user = await createUser();

    return prisma.membership.create({
      data: {
        organizationId,
        userId: user.id,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });
  }

  function activeCount() {
    return prisma.membership.count({
      where: {
        organizationId,
        status: "ACTIVE",
      },
    });
  }

  function pendingCount() {
    return prisma.membershipInvitation.count({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  beforeEach(async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Invitation capacity ${suffix}`,
        slug: `invitation-capacity-${suffix}`,
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

  it("reserves the remaining Starter slot when creating an invitation", async () => {
    const invitation = await createInvitation();

    assert.equal(invitation.organizationId, organizationId);
    assert.equal(invitation.acceptedAt, null);
    assert.equal(invitation.revokedAt, null);

    assert.equal(await activeCount(), 1);
    assert.equal(await pendingCount(), 1);
  });

  it("rejects a second invitation when capacity is reserved", async () => {
    await createInvitation();

    await assert.rejects(
      createInvitation(),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );

    assert.equal(await pendingCount(), 1);
  });

  it("allows only one concurrent invitation to reserve the last slot", async () => {
    const results = await Promise.allSettled([
      createInvitation(),
      createInvitation(),
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

    assert.equal(await pendingCount(), 1);
  });

  it("accepts an invitation at capacity by replacing its reservation", async () => {
    const invitation = await createInvitation();
    const user = await createUser(invitation.email);

    const membership = await acceptInvitation(
      invitation.id,
      user.id,
    );

    assert.equal(membership.status, "ACTIVE");
    assert.equal(membership.userId, user.id);

    assert.equal(await activeCount(), 2);
    assert.equal(await pendingCount(), 0);

    const accepted =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });

    assert.ok(accepted.acceptedAt);

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

  it("refreshes a pending invitation without reserving a second slot", async () => {
    const invitation = await createInvitation();
    const nextHash = randomUUID();

    const refreshed = await refreshMembershipInvitationRecord(
      invitation.id,
      nextHash,
      futureDate(),
    );

    assert.equal(refreshed.tokenHash, nextHash);
    assert.equal(refreshed.acceptedAt, null);
    assert.equal(refreshed.revokedAt, null);
    assert.equal(await pendingCount(), 1);
  });

  it("blocks refreshing an expired invitation when its former slot is occupied", async () => {
    const invitation = await seedExpiredInvitation();

    await seedActiveMember();

    await assert.rejects(
      refreshMembershipInvitationRecord(
        invitation.id,
        randomUUID(),
        futureDate(),
      ),
      { code: "BILLING_USER_LIMIT_REACHED" },
    );

    const unchanged =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });

    assert.equal(unchanged.tokenHash, invitation.tokenHash);
    assert.equal(
      unchanged.expiresAt.getTime(),
      invitation.expiresAt.getTime(),
    );

    assert.equal(await pendingCount(), 0);
    assert.equal(await activeCount(), 2);
  });

  it("releases reserved capacity when an invitation is revoked", async () => {
    const invitation = await createInvitation();

    const revoked = await revokeMembershipInvitationRecord(
      invitation.id,
    );

    assert.ok(revoked.revokedAt);
    assert.equal(await pendingCount(), 0);

    await createInvitation();

    assert.equal(await pendingCount(), 1);
  });

  it("rejects acceptance of an expired invitation without creating membership", async () => {
    const invitation = await seedExpiredInvitation();
    const user = await createUser(invitation.email);

    await assert.rejects(
      acceptInvitation(invitation.id, user.id),
      { code: "MEMBERSHIP_INVITATION_EXPIRED" },
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

  it("rejects acceptance of a revoked invitation", async () => {
    const invitation = await createInvitation();
    const user = await createUser(invitation.email);

    await revokeMembershipInvitationRecord(invitation.id);

    await assert.rejects(
      acceptInvitation(invitation.id, user.id),
      { code: "MEMBERSHIP_INVITATION_REVOKED" },
    );

    assert.equal(await activeCount(), 1);
  });

  it("allows only one concurrent acceptance of an invitation", async () => {
    const invitation = await createInvitation();
    const user = await createUser(invitation.email);

    const results = await Promise.allSettled([
      acceptInvitation(invitation.id, user.id),
      acceptInvitation(invitation.id, user.id),
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
      "MEMBERSHIP_INVITATION_ALREADY_ACCEPTED",
    );

    assert.equal(await activeCount(), 2);
    assert.equal(await pendingCount(), 0);

    assert.equal(
      await prisma.membership.count({
        where: {
          organizationId,
          userId: user.id,
        },
      }),
      1,
    );
  });

  it("shares the last slot between concurrent invitation and direct-membership requests", async () => {
    const user = await createUser();

    const results = await Promise.allSettled([
      createInvitation(),

      createMembershipWithPermissions(
        organizationId,
        user.id,
        "TECHNICIAN",
        [Permissions.BILLING_VIEW],
        ownerMembershipId,
      ),
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
      (await activeCount()) + (await pendingCount()),
      2,
    );
  });

  it("rejects invitation acceptance through another organization", async () => {
    const invitation = await createInvitation();
    const user = await createUser(invitation.email);
    const suffix = randomUUID();

    const otherOrganization = await prisma.organization.create({
      data: {
        name: `Other invitation capacity ${suffix}`,
        slug: `other-invitation-capacity-${suffix}`,
      },
    });

    organizationIds.push(otherOrganization.id);

    await assert.rejects(
      acceptInvitation(
        invitation.id,
        user.id,
        otherOrganization.id,
      ),
      { code: "MEMBERSHIP_INVITATION_NOT_FOUND" },
    );

    assert.equal(await activeCount(), 1);
    assert.equal(await pendingCount(), 1);
  });

  it("rejects an email mismatch without consuming the reservation", async () => {
    const invitation = await createInvitation();
    const wrongUser = await createUser();

    await assert.rejects(
      acceptInvitation(invitation.id, wrongUser.id),
      { code: "MEMBERSHIP_INVITATION_EMAIL_MISMATCH" },
    );

    assert.equal(await activeCount(), 1);
    assert.equal(await pendingCount(), 1);

    const unchanged =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });

    assert.equal(unchanged.acceptedAt, null);
  });

  it("allows an exempt organization to reserve users without a subscription", async () => {
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

    await createInvitation();
    await createInvitation();

    assert.equal(await pendingCount(), 2);
    assert.equal(await activeCount(), 1);
  });
});

//************************************************************** */