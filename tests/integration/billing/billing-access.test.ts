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
  assertOrganizationBillingAccess,
  isOrganizationBillingExempt,
} from "../../../src/modules/billing/billing-access.service.js";

//************************************************************** */

describe("Organization billing access", () => {
  const userIds: string[] = [];

  let organizationId: string;
  let ownerId: string;
  let memberId: string;
  let memberMembershipId: string;

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `billing-${label}-${randomUUID()}@example.com`,
        firstName: "Billing",
        lastName: label,
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  beforeEach(async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Billing access ${suffix}`,
        slug: `billing-access-${suffix}`,
      },
    });

    organizationId = organization.id;

    const owner = await createUser("Owner");
    const member = await createUser("Member");

    ownerId = owner.id;
    memberId = member.id;

    await prisma.membership.create({
      data: {
        organizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: memberId,
        role: "SERVICE_ADVISOR",
        status: "ACTIVE",
      },
    });

    memberMembershipId = membership.id;
  });

  afterEach(async () => {
    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });

    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });

    userIds.length = 0;
  });

  it("allows verified active owners to view and update billing", async () => {
    for (const permission of [
      Permissions.BILLING_VIEW,
      Permissions.BILLING_UPDATE,
    ]) {
      const access = await assertOrganizationBillingAccess(
        organizationId,
        ownerId,
        permission,
      );

      assert.equal(access.organizationId, organizationId);
      assert.equal(access.userId, ownerId);
    }
  });

  it("does not let a platform grant bypass organization membership", async () => {
    const outsider = await createUser("Outsider");

    await prisma.platformAdmin.create({
      data: {
        userId: outsider.id,
        role: "SUPER_ADMIN",
        billingExempt: true,
      },
    });

    await assert.rejects(
      assertOrganizationBillingAccess(
        organizationId,
        outsider.id,
        Permissions.BILLING_UPDATE,
      ),
      { code: "ORGANIZATION_NOT_FOUND" },
    );

    assert.equal(
      await isOrganizationBillingExempt(organizationId),
      false,
    );
  });

  it("uses stored member permissions and observes their removal", async () => {
    await assert.rejects(
      assertOrganizationBillingAccess(
        organizationId,
        memberId,
        Permissions.BILLING_UPDATE,
      ),
      { code: "INSUFFICIENT_PERMISSIONS" },
    );

    const grant = await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: memberMembershipId,
        permission: Permissions.BILLING_UPDATE,
      },
    });

    const access = await assertOrganizationBillingAccess(
      organizationId,
      memberId,
      Permissions.BILLING_UPDATE,
    );

    assert.equal(access.membershipId, memberMembershipId);

    // Update permission alone does not implicitly grant view.
    await assert.rejects(
      assertOrganizationBillingAccess(
        organizationId,
        memberId,
        Permissions.BILLING_VIEW,
      ),
      { code: "INSUFFICIENT_PERMISSIONS" },
    );

    await prisma.membershipPermission.delete({
      where: { id: grant.id },
    });

    await assert.rejects(
      assertOrganizationBillingAccess(
        organizationId,
        memberId,
        Permissions.BILLING_UPDATE,
      ),
      { code: "INSUFFICIENT_PERMISSIONS" },
    );
  });

  it("rejects suspended memberships even when billing permission remains stored", async () => {
    await prisma.membershipPermission.create({
      data: {
        organizationId,
        membershipId: memberMembershipId,
        permission: Permissions.BILLING_UPDATE,
      },
    });

    await prisma.membership.update({
      where: { id: memberMembershipId },
      data: { status: "SUSPENDED" },
    });

    await assert.rejects(
      assertOrganizationBillingAccess(
        organizationId,
        memberId,
        Permissions.BILLING_UPDATE,
      ),
      { code: "ORGANIZATION_NOT_FOUND" },
    );
  });

  it("requires verified email and an active organization", async () => {
    await prisma.user.update({
      where: { id: ownerId },
      data: { emailVerifiedAt: null },
    });

    await assert.rejects(
      assertOrganizationBillingAccess(
        organizationId,
        ownerId,
        Permissions.BILLING_UPDATE,
      ),
      { code: "BILLING_EMAIL_VERIFICATION_REQUIRED" },
    );

    await prisma.user.update({
      where: { id: ownerId },
      data: { emailVerifiedAt: new Date() },
    });

    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: "ARCHIVED" },
    });

    await assert.rejects(
      assertOrganizationBillingAccess(
        organizationId,
        ownerId,
        Permissions.BILLING_UPDATE,
      ),
      { code: "ORGANIZATION_NOT_FOUND" },
    );
  });

  it("requires an explicit active owner exemption", async () => {
    assert.equal(
      await isOrganizationBillingExempt(organizationId),
      false,
    );

    await prisma.platformAdmin.create({
      data: {
        userId: ownerId,
        role: "SUPER_ADMIN",
        billingExempt: false,
      },
    });

    assert.equal(
      await isOrganizationBillingExempt(organizationId),
      false,
    );

    await prisma.platformAdmin.update({
      where: { userId: ownerId },
      data: { billingExempt: true },
    });

    assert.equal(
      await isOrganizationBillingExempt(organizationId),
      true,
    );

    await prisma.platformAdmin.update({
      where: { userId: ownerId },
      data: { isActive: false },
    });

    assert.equal(
      await isOrganizationBillingExempt(organizationId),
      false,
    );
  });

  it("does not extend an employee exemption to their organization", async () => {
    await prisma.platformAdmin.create({
      data: {
        userId: memberId,
        role: "SUPER_ADMIN",
        billingExempt: true,
      },
    });

    assert.equal(
      await isOrganizationBillingExempt(organizationId),
      false,
    );
  });
});