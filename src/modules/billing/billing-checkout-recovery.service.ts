import { env } from "../../config/env.js";

import { getStripeClient } from "../../config/stripe.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  findOrganizationBilling,
} from "./billing.repository.js";

import {
  saveOrganizationCheckoutSession,
} from "./billing-checkout.repository.js";

//************************************************************** */

function reconciliationRequired(): AppError {
  return new AppError(
    409,
    "Checkout requires reconciliation before continuing.",
    {
      code: "BILLING_CHECKOUT_RECONCILIATION_REQUIRED",
    },
  );
}

//************************************************************** */

// Internal helper. The caller must authorize billing access first.
export async function recoverOrganizationCheckout(
  organizationId: string,
): Promise<boolean> {
  const billing = await findOrganizationBilling(organizationId);

  if (
    !billing ||
    !billing.checkoutOperationId ||
    billing.checkoutSessionId
  ) {
    return false;
  }

  if (!billing.stripeCustomerId) {
    throw reconciliationRequired();
  }

  const stripe = getStripeClient();

  const sessions = await stripe.checkout.sessions.list({
    customer: billing.stripeCustomerId,
    limit: 100,
  });

  // Do not infer that a checkout is absent from partial history.
  if (sessions.has_more) {
    throw reconciliationRequired();
  }

  const matches = sessions.data.filter(
    (session) =>
      session.metadata?.organizationId === organizationId &&
      session.metadata?.checkoutOperationId ===
        billing.checkoutOperationId,
  );

  if (matches.length === 0) {
    // Stripe may still be processing the original request.
    // Retain the claim and let the caller report a pending checkout.
    return false;
  }

  if (matches.length !== 1) {
    throw reconciliationRequired();
  }

  const session = matches[0]!;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (
    session.mode !== "subscription" ||
    session.livemode !== (env.STRIPE_MODE === "live") ||
    customerId !== billing.stripeCustomerId ||
    session.client_reference_id !== organizationId ||
    !Number.isSafeInteger(session.expires_at) ||
    session.expires_at <= 0
  ) {
    throw reconciliationRequired();
  }

  const expiresAt = new Date(session.expires_at * 1_000);

  if (!Number.isFinite(expiresAt.getTime())) {
    throw reconciliationRequired();
  }

  const saved = await saveOrganizationCheckoutSession(
    organizationId,
    billing.checkoutOperationId,
    billing.stripeCustomerId,
    session.id,
    expiresAt,
  );

  if (saved) {
    return true;
  }

  // Another request may have recovered the same session first.
  const current = await findOrganizationBilling(organizationId);

  if (
    current?.stripeCustomerId === billing.stripeCustomerId &&
    current.checkoutOperationId === billing.checkoutOperationId &&
    current.checkoutSessionId === session.id
  ) {
    return true;
  }

  throw reconciliationRequired();
}

//************************************************************** */