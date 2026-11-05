
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
  claimOrganizationCheckout,
} from "../../../src/modules/billing/billing-checkout.repository.js";

//************************************************************** */

describe("Checkout user capacity enforcement", () => {
  let organizationId: string;
  let customerId: string;
  let userIds: string[];

  beforeEach(async () => {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Checkout capacity ${suffix}`,
        slug: `checkout-capacity-${suffix}`,
      },
    });

    organizationId = organization.id;
    customerId = `cus_test_${suffix}`;
    userIds = [];

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        stripeCustomerId: customerId,
      },
    });
  });

  afterEach(async () => {
    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: { in: userIds },
        },
      });
    }
  });

  //************************************************************** */

  async function addMembership(
    status: "ACTIVE" | "INVITED" = "ACTIVE",
  ): Promise<string> {
    const suffix = randomUUID();

    const user = await prisma.user.create({
      data: {
        email: `capacity-${suffix}@example.com`,
        firstName: "Capacity",
        lastName: "Test",
      },
    });

    userIds.push(user.id);

    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: user.id,
        role: "TECHNICIAN",
        status,
      },
    });

    return membership.id;
  }

  async function addPendingInvitation(
    invitedByMembershipId: string,
    expired = false,
  ): Promise<void> {
    const suffix = randomUUID();

    await prisma.membershipInvitation.create({
      data: {
        organizationId,
        invitedByMembershipId,
        email: `pending-${suffix}@example.com`,
        role: "TECHNICIAN",
        tokenHash: suffix.replaceAll("-", ""),
        expiresAt: new Date(
          Date.now() +
            (expired ? -86_400_000 : 86_400_000),
        ),
      },
    });
  }

  async function claim(
    planId: "starter" | "business" | "pro",
  ): Promise<boolean> {
    return claimOrganizationCheckout(
      organizationId,
      customerId,
      randomUUID(),
      planId,
    );
  }

  async function expectCapacityError(
    planId: "starter" | "business" | "pro",
    code: string,
  ): Promise<void> {
    await assert.rejects(
      () => claim(planId),
      (error: unknown) => {
        assert.equal(
          (error as { code?: string }).code,
          code,
        );
        return true;
      },
    );

    const billing =
      await prisma.organizationBilling.findUniqueOrThrow({
        where: { organizationId },
      });

    assert.equal(
      billing.checkoutOperationId,
      null,
      "Rejected checkout must not claim billing",
    );
  }

  //************************************************************** */

  it("allows Starter with two occupied seats", async () => {
    await addMembership();
    await addMembership();

    assert.equal(await claim("starter"), true);
  });

  it("rejects Starter with three occupied seats", async () => {
    await addMembership();
    await addMembership();
    await addMembership();

    await expectCapacityError(
      "starter",
      "BILLING_CHECKOUT_USER_LIMIT_EXCEEDED",
    );
  });

  it("counts invited memberships as reserved seats", async () => {
    await addMembership();
    await addMembership("INVITED");
    await addMembership("INVITED");

    await expectCapacityError(
      "starter",
      "BILLING_CHECKOUT_USER_LIMIT_EXCEEDED",
    );
  });

  it("counts unexpired pending invitations", async () => {
    const inviterId = await addMembership();

    await addPendingInvitation(inviterId);
    await addPendingInvitation(inviterId);

    await expectCapacityError(
      "starter",
      "BILLING_CHECKOUT_USER_LIMIT_EXCEEDED",
    );
  });

  it("does not count expired invitations", async () => {
    const inviterId = await addMembership();

    await addPendingInvitation(inviterId, true);

    assert.equal(await claim("starter"), true);
  });

  it("allows Business with five occupied seats", async () => {
    for (let index = 0; index < 5; index++) {
      await addMembership();
    }

    assert.equal(await claim("business"), true);
  });

  it("rejects Business with six occupied seats", async () => {
    for (let index = 0; index < 6; index++) {
      await addMembership();
    }

    await expectCapacityError(
      "business",
      "BILLING_CHECKOUT_USER_LIMIT_EXCEEDED",
    );
  });

  it("allows Pro with ten occupied seats", async () => {
    for (let index = 0; index < 10; index++) {
      await addMembership();
    }

    assert.equal(await claim("pro"), true);
  });

  it("blocks over-capacity Pro resubscription", async () => {
    for (let index = 0; index < 13; index++) {
      await addMembership();
    }

    await prisma.organizationBilling.update({
      where: { organizationId },
      data: { status: "CANCELED" },
    });

    await expectCapacityError(
      "pro",
      "BILLING_CHECKOUT_ADDITIONAL_USERS_REQUIRED",
    );
  });

  it("does not create competing checkout claims", async () => {
    await addMembership();

    const results = await Promise.all([
      claim("starter"),
      claim("starter"),
    ]);

    assert.equal(
      results.filter((result) => result === true).length,
      1,
    );
  });
});

//************************************************************** */
