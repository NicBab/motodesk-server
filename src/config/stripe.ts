import Stripe from "stripe";

import { env } from "./env.js";

import { AppError } from "../platform/errors/app-error.js";

//************************************************************** */

let stripeClient: Stripe | undefined;

//************************************************************** */

export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new AppError(
      503,
      "Billing is currently unavailable.",
      {
        code: "BILLING_NOT_CONFIGURED",
      },
    );
  }

  stripeClient = new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 20_000,
  });

  return stripeClient;
}

//************************************************************** */