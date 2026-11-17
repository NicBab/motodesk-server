
import assert from "node:assert/strict";

import {
  beforeEach,
  describe,
  it,
} from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  BillingSubscriptionStatus,
} from "../../../src/generated/prisma/client.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

describe("Subscription access HTTP endpoint", () => {
  let owner: Awaited<
    ReturnType<typeof createAuthenticatedAgent>
  >;

  beforeEach(async () => {
    owner = await createAuthenticatedAgent();
  });

  //************************************************************** */

  function endpoint(
    organizationId = owner.organizationId,
  ): string {
    return (
      `/api/v1/organizations/${organizationId}` +
      "/billing/access"
    );
  }

  async function setBilling(
    status: BillingSubscriptionStatus,
    options: {
      trialEndsAt?: Date | null;
      endedAt?: Date | null;
    } = {},
  ): Promise<void> {
    await prisma.organizationBilling.update({
      where: {
        organizationId: owner.organizationId,
      },
      data: {
        status,
        trialEndsAt: options.trialEndsAt ?? null,
        endedAt: options.endedAt ?? null,
      },
    });
  }

  async function expectAccessMode(
    accessMode: "FULL" | "READ_ONLY",
  ): Promise<void> {
    const response = await owner.agent.get(
      endpoint(),
    );

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    assert.deepEqual(response.body, {
      success: true,
      data: {
        accessMode,
      },
    });
  }

  //************************************************************** */

  it("returns FULL for an active subscription", async () => {
    await setBilling(
      BillingSubscriptionStatus.ACTIVE,
    );

    await expectAccessMode("FULL");
  });

  it("returns FULL for an unexpired trial", async () => {
    await setBilling(
      BillingSubscriptionStatus.TRIALING,
      {
        trialEndsAt: new Date(
          Date.now() + 86_400_000,
        ),
      },
    );

    await expectAccessMode("FULL");
  });

  it("returns READ_ONLY for an expired trial", async () => {
    await setBilling(
      BillingSubscriptionStatus.TRIALING,
      {
        trialEndsAt: new Date(
          Date.now() - 86_400_000,
        ),
      },
    );

    await expectAccessMode("READ_ONLY");
  });

  it("returns READ_ONLY for a canceled subscription", async () => {
    await setBilling(
      BillingSubscriptionStatus.CANCELED,
    );

    await expectAccessMode("READ_ONLY");
  });

  it("returns READ_ONLY for a past-due subscription", async () => {
    await setBilling(
      BillingSubscriptionStatus.PAST_DUE,
    );

    await expectAccessMode("READ_ONLY");
  });

  it("returns READ_ONLY when the subscription has ended", async () => {
    await setBilling(
      BillingSubscriptionStatus.ACTIVE,
      {
        endedAt: new Date(
          Date.now() - 86_400_000,
        ),
      },
    );

    await expectAccessMode("READ_ONLY");
  });

  it("returns READ_ONLY when billing does not exist", async () => {
    await prisma.organizationBilling.delete({
      where: {
        organizationId: owner.organizationId,
      },
    });

    await expectAccessMode("READ_ONLY");
  });

  //************************************************************** */

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get(
      endpoint(),
    );

    assert.equal(response.status, 401);
  });

  it("rejects cross-organization access", async () => {
    const other = await createAuthenticatedAgent();

    const response = await owner.agent.get(
      endpoint(other.organizationId),
    );

    assert.equal(
      response.status,
      403,
      JSON.stringify(response.body),
    );
  });

  it("allows active members without billing permissions", async () => {
    await prisma.membership.update({
      where: {
        id: owner.membershipId,
      },
      data: {
        role: "SERVICE_ADVISOR",
      },
    });

    await prisma.membershipPermission.deleteMany({
      where: {
        membershipId: owner.membershipId,
      },
    });

    await setBilling(
      BillingSubscriptionStatus.ACTIVE,
    );

    const overview = await owner.agent.get(
      `/api/v1/organizations/${owner.organizationId}/billing`,
    );

    assert.equal(
      overview.status,
      403,
      JSON.stringify(overview.body),
    );

    await expectAccessMode("FULL");
  });

  it("rejects suspended memberships", async () => {
    await prisma.membership.update({
      where: {
        id: owner.membershipId,
      },
      data: {
        status: "SUSPENDED",
      },
    });

    const response = await owner.agent.get(
      endpoint(),
    );

    assert.ok(
      response.status === 401 ||
        response.status === 403,
      JSON.stringify(response.body),
    );
  });

  it("prevents caching of subscription access responses", async () => {
    const response = await owner.agent.get(
      endpoint(),
    );

    assert.equal(response.status, 200);

    assert.match(
      String(
        response.headers["cache-control"] ?? "",
      ),
      /no-store/i,
    );
  });
});

//************************************************************** */
