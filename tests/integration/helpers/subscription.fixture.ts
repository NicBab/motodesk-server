
import assert from "node:assert/strict";

import { prisma } from "../../../src/config/prisma.js";

//************************************************************** */

const TRIAL_DURATION_MS =
  14 * 24 * 60 * 60 * 1000;

//************************************************************** */

export async function createTrialSubscriptionFixture(
  organizationId: string,
): Promise<void> {
  assert.ok(
    organizationId,
    "An organization identifier is required.",
  );

  if (
    process.env.NODE_ENV === "production" ||
    process.env.STRIPE_MODE === "live"
  ) {
    throw new Error(
      "Subscription test fixtures cannot run in production or Stripe live mode.",
    );
  }

  //************************************************************** */
  // Verify that the fixture organization exists.

  const organization =
    await prisma.organization.findUnique({
      where: {
        id: organizationId,
      },

      select: {
        id: true,
      },
    });

  assert.ok(
    organization,
    "Subscription fixture organization does not exist.",
  );

  //************************************************************** */
  // Never overwrite an existing subscription.
  //
  // This helper is intended for newly created,
  // disposable integration test organizations.

  const existingBilling =
    await prisma.organizationBilling.findUnique({
      where: {
        organizationId,
      },
    });

  assert.equal(
    existingBilling,
    null,
    "The fixture organization already has a billing record.",
  );

  //************************************************************** */
  // Establish a valid local Pro trial.
  //
  // No Stripe API operations are performed.

  const now = new Date();

  await prisma.organizationBilling.create({
    data: {
      organizationId,

      planId: "pro",

      status: "TRIALING",

      currency: "usd",

      unitAmount: 29_900,

      trialStartedAt: now,

      trialEndsAt: new Date(
        now.getTime() + TRIAL_DURATION_MS,
      ),
    },
  });
}

//************************************************************** */
