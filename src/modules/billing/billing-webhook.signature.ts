import { Buffer } from "node:buffer";

import type Stripe from "stripe";

import { env } from "../../config/env.js";

import { getStripeClient } from "../../config/stripe.js";

import { AppError } from "../../platform/errors/app-error.js";

//************************************************************** */

export function verifyBillingWebhookSignature(
  rawBody: unknown,
  signature: string | undefined,
): Stripe.Event {
  const signingSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!signingSecret) {
    throw new AppError(
      503,
      "Billing webhook processing is unavailable.",
      {
        code: "BILLING_WEBHOOK_NOT_CONFIGURED",
      },
    );
  }

  if (!Buffer.isBuffer(rawBody)) {
    throw new AppError(
      400,
      "A raw webhook request body is required.",
      {
        code: "BILLING_WEBHOOK_RAW_BODY_REQUIRED",
      },
    );
  }

  if (!signature || signature.trim().length === 0) {
    throw new AppError(
      400,
      "A webhook signature is required.",
      {
        code: "BILLING_WEBHOOK_SIGNATURE_REQUIRED",
      },
    );
  }

  const stripe = getStripeClient();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      signingSecret,
    );
  } catch {
    // Do not expose the payload, signature, secret, or SDK error.
    throw new AppError(
      400,
      "Webhook signature verification failed.",
      {
        code: "BILLING_WEBHOOK_SIGNATURE_INVALID",
      },
    );
  }

  if (event.livemode !== (env.STRIPE_MODE === "live")) {
    throw new AppError(
      400,
      "Webhook mode does not match the billing environment.",
      {
        code: "BILLING_WEBHOOK_MODE_INVALID",
      },
    );
  }

  // MotoDesk billing uses this Stripe account directly,
  // rather than subscriptions belonging to Connect accounts.
  if (event.account) {
    throw new AppError(
      400,
      "Connected-account billing events are unsupported.",
      {
        code: "BILLING_WEBHOOK_ACCOUNT_UNSUPPORTED",
      },
    );
  }

  return event;
}

//************************************************************** */