
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "node:test";

import type {
  NextFunction,
  Response,
} from "express";

import { prisma } from "../../../src/config/prisma.js";

import {
  BillingSubscriptionStatus,
} from "../../../src/generated/prisma/client.js";

import { AppError } from "../../../src/platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../../../src/modules/auth/index.js";

import {
  requireSubscriptionAccess,
} from "../../../src/modules/billing/billing-subscription-access.middleware.js";

//************************************************************** */

describe("Subscription business access enforcement", () => {
  let organizationId: string;
  let userId: string;

  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  const now = () => new Date();

  const future = () =>
    new Date(Date.now() + 86400000);

  const past = () =>
    new Date(Date.now() - 86400000);

  beforeEach(async () => {
    const suffix = randomUUID();

    const user = await prisma.user.create({
      data: {
        email: `subscription-access-${suffix}@example.com`,
        firstName: "Subscription",
        lastName: "Tester",
        emailVerifiedAt: now(),
      },
    });

    userId = user.id;
    createdUserIds.push(userId);

    const organization = await prisma.organization.create({
      data: {
        name: `Subscription Access ${suffix}`,
        slug: `subscription-access-${suffix}`,
      },
    });

    organizationId = organization.id;
    createdOrganizationIds.push(organizationId);

    await prisma.membership.create({
      data: {
        organizationId,
        userId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
  });

  afterEach(async () => {
    if (createdOrganizationIds.length) {
      await prisma.organization.deleteMany({
        where: {
          id: {
            in: createdOrganizationIds,
          },
        },
      });
    }

    if (createdUserIds.length) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
    }

    createdOrganizationIds.length = 0;
    createdUserIds.length = 0;
  });

  //************************************************************** */

  async function setBilling(
    status: BillingSubscriptionStatus,
    options: {
      trialEndsAt?: Date | null;
      endedAt?: Date | null;
    } = {},
  ) {
    await prisma.organizationBilling.upsert({
      where: {
        organizationId,
      },
      create: {
        organizationId,
        status,
        trialEndsAt: options.trialEndsAt ?? null,
        endedAt: options.endedAt ?? null,
      },
      update: {
        status,
        trialEndsAt: options.trialEndsAt ?? null,
        endedAt: options.endedAt ?? null,
      },
    });
  }

  //************************************************************** */

  async function checkAccess(
    method: string,
    requestedOrganizationId = organizationId,
    authenticatedOrganizationId = organizationId,
  ): Promise<AppError | null> {
    const request = {
      method,
      params: {
        organizationId: requestedOrganizationId,
      },
      authenticatedMembership: {
        organizationId: authenticatedOrganizationId,
      },
    } as unknown as AuthenticatedRequest;

    let result: unknown = null;

    const next: NextFunction = (error?: unknown) => {
      result = error ?? null;
    };

    await requireSubscriptionAccess(
      request,
      {} as Response,
      next,
    );

    if (result === null) {
      return null;
    }

    assert.ok(result instanceof AppError);
    return result;
  }

  //************************************************************** */

  it("allows active subscriptions to mutate business data", async () => {
    await setBilling(BillingSubscriptionStatus.ACTIVE);

    const error = await checkAccess("POST");

    assert.equal(error, null);
  });

  it("allows an unexpired trial", async () => {
    await setBilling(
      BillingSubscriptionStatus.TRIALING,
      { trialEndsAt: future() },
    );

    assert.equal(await checkAccess("POST"), null);
  });

  it("restricts an expired trial", async () => {
    await setBilling(
      BillingSubscriptionStatus.TRIALING,
      { trialEndsAt: past() },
    );

    const error = await checkAccess("POST");

    assert.equal(
      error?.code,
      "SUBSCRIPTION_ACCESS_RESTRICTED",
    );
  });

  it("restricts all inactive billing statuses", async () => {
    const statuses = [
      BillingSubscriptionStatus.NOT_SUBSCRIBED,
      BillingSubscriptionStatus.INCOMPLETE,
      BillingSubscriptionStatus.INCOMPLETE_EXPIRED,
      BillingSubscriptionStatus.PAST_DUE,
      BillingSubscriptionStatus.UNPAID,
      BillingSubscriptionStatus.PAUSED,
      BillingSubscriptionStatus.CANCELED,
    ];

    for (const status of statuses) {
      await setBilling(status);

      const error = await checkAccess("PATCH");

      assert.equal(
        error?.code,
        "SUBSCRIPTION_ACCESS_RESTRICTED",
        `Expected ${status} to be restricted`,
      );
    }
  });

  it("allows read requests for inactive subscriptions", async () => {
    await setBilling(BillingSubscriptionStatus.CANCELED);

    assert.equal(await checkAccess("GET"), null);
    assert.equal(await checkAccess("HEAD"), null);
  });

  it("rejects mutations when no billing record exists", async () => {
    const error = await checkAccess("DELETE");

    assert.equal(
      error?.code,
      "SUBSCRIPTION_ACCESS_RESTRICTED",
    );
  });

  it("rejects subscriptions that have ended", async () => {
    await setBilling(
      BillingSubscriptionStatus.ACTIVE,
      { endedAt: past() },
    );

    const error = await checkAccess("POST");

    assert.equal(
      error?.code,
      "SUBSCRIPTION_ACCESS_RESTRICTED",
    );
  });

  it("rejects cross-organization access", async () => {
    await setBilling(BillingSubscriptionStatus.ACTIVE);

    const error = await checkAccess(
      "GET",
      organizationId,
      "another-organization",
    );

    assert.equal(
      error?.code,
      "ORGANIZATION_ACCESS_DENIED",
    );
  });
});

//************************************************************** */
