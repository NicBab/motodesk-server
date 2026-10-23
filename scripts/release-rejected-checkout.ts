import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";
import { getStripeClient } from "../src/config/stripe.js";

//************************************************************** */

const operationId =
  "71ac5c52-ec29-4b80-baf6-2b3512c68760";

class RecoveryBlocked extends Error {}

//************************************************************** */

async function main(): Promise<void> {
  if (env.STRIPE_MODE !== "test") {
    throw new RecoveryBlocked(
      "Recovery is restricted to Stripe test mode.",
    );
  }

  const billing = await prisma.organizationBilling.findUnique({
    where: {
      checkoutOperationId: operationId,
    },

    include: {
      organization: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!billing) {
    console.log(
      "No billing record has this operation ID. Nothing changed.",
    );

    return;
  }

  if (
    !billing.stripeCustomerId ||
    billing.checkoutSessionId !== null ||
    billing.stripeSubscriptionId !== null ||
    billing.status !== "NOT_SUBSCRIBED"
  ) {
    throw new RecoveryBlocked(
      "The billing record has additional state. Nothing changed; review is required.",
    );
  }

  const stripe = getStripeClient();

  const customer = await stripe.customers.retrieve(
    billing.stripeCustomerId,
  );

  if (
    customer.deleted ||
    customer.livemode ||
    customer.metadata.organizationId !== billing.organizationId
  ) {
    throw new RecoveryBlocked(
      "Stripe customer mapping does not match. Nothing changed.",
    );
  }

  const sessions = await stripe.checkout.sessions.list({
    customer: customer.id,
    limit: 100,
  });

  if (sessions.has_more) {
    throw new RecoveryBlocked(
      "Checkout history is incomplete. Nothing changed.",
    );
  }

  const matchingOrUnfinishedSession = sessions.data.some(
    (session) =>
      session.metadata?.checkoutOperationId === operationId ||
      session.status === "open" ||
      session.status === "complete",
  );

  if (matchingOrUnfinishedSession) {
    throw new RecoveryBlocked(
      "Stripe has a matching, open, or completed checkout. Nothing changed; recover that session instead.",
    );
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customer.id,
    status: "all",
    limit: 1,
  });

  if (
    subscriptions.data.length > 0 ||
    subscriptions.has_more
  ) {
    throw new RecoveryBlocked(
      "Stripe has subscription history for this customer. Nothing changed; review is required.",
    );
  }

  const result = await prisma.organizationBilling.updateMany({
    where: {
      id: billing.id,
      organizationId: billing.organizationId,
      stripeCustomerId: customer.id,
      checkoutOperationId: operationId,
      checkoutSessionId: null,
      checkoutSessionExpiresAt: null,
      stripeSubscriptionId: null,
      status: "NOT_SUBSCRIBED",
    },

    data: {
      checkoutOperationId: null,
    },
  });

  if (result.count !== 1) {
    throw new RecoveryBlocked(
      "Billing state changed during recovery. No claim was cleared.",
    );
  }

  console.log(
    `Cleared the rejected checkout claim for "${billing.organization.name}".`,
  );

  console.log(
    "The Stripe customer and organization billing record were preserved.",
  );
}

//************************************************************** */

try {
  await main();
} catch (error) {
  console.error(
    error instanceof RecoveryBlocked
      ? error.message
      : "Recovery failed. Do not clear the record manually; report this failure.",
  );

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}