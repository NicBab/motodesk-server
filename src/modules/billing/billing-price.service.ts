import { env } from "../../config/env.js";

import { getStripeClient } from "../../config/stripe.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  getBillingPlan,
  type BillingPlanId,
} from "./billing.constants.js";

//************************************************************** */

export interface ValidatedBillingPrice {
  planId: BillingPlanId;
  stripePriceId: string;
  stripeProductId: string;
  currency: string;
  unitAmount: number;
}

//************************************************************** */

function invalidPriceConfiguration(): AppError {
  return new AppError(
    503,
    "The selected billing plan is currently unavailable.",
    {
      code: "BILLING_PRICE_CONFIGURATION_INVALID",
    },
  );
}

//************************************************************** */

export async function resolveBillingPrice(
  planId: BillingPlanId,
): Promise<ValidatedBillingPrice> {
  const plan = getBillingPlan(planId);

  const stripe = getStripeClient();

  const prices = await stripe.prices.list({
    active: true,
    lookup_keys: [plan.stripeLookupKey],
    limit: 2,
    expand: ["data.product"],
  });

  const price = prices.data[0];

  if (
    !price ||
    prices.data.length !== 1 ||
    prices.has_more
  ) {
    throw invalidPriceConfiguration();
  }

  if (
    !price.active ||
    price.lookup_key !== plan.stripeLookupKey ||
    price.livemode !== (env.STRIPE_MODE === "live") ||
    price.type !== "recurring" ||
    price.billing_scheme !== "per_unit" ||
    price.currency !== plan.currency ||
    price.unit_amount !== plan.unitAmount ||
    price.recurring?.interval !== plan.interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    price.transform_quantity !== null ||
    price.custom_unit_amount !== null
  ) {
    throw invalidPriceConfiguration();
  }

  const product = price.product;

  if (
    typeof product === "string" ||
    product.deleted ||
    !product.active ||
    product.livemode !== (env.STRIPE_MODE === "live")
  ) {
    throw invalidPriceConfiguration();
  }

  return {
    planId,
    stripePriceId: price.id,
    stripeProductId: product.id,
    currency: plan.currency,
    unitAmount: plan.unitAmount,
  };
}

//************************************************************** */