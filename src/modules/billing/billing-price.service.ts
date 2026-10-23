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

interface ExpectedBillingPrice {
  planId: BillingPlanId;
  stripeLookupKey: string;
  currency: "usd";
  interval: "month";
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

async function resolveValidatedBillingPrice(
  expected: ExpectedBillingPrice,
): Promise<ValidatedBillingPrice> {
  const stripe = getStripeClient();

  const prices = await stripe.prices.list({
    active: true,
    lookup_keys: [expected.stripeLookupKey],
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
    price.lookup_key !== expected.stripeLookupKey ||
    price.livemode !== (env.STRIPE_MODE === "live") ||
    price.type !== "recurring" ||
    price.billing_scheme !== "per_unit" ||
    price.currency !== expected.currency ||
    price.unit_amount !== expected.unitAmount ||
    price.recurring?.interval !== expected.interval ||
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
    planId: expected.planId,
    stripePriceId: price.id,
    stripeProductId: product.id,
    currency: expected.currency,
    unitAmount: expected.unitAmount,
  };
}

//************************************************************** */

export async function resolveBillingPrice(
  planId: BillingPlanId,
): Promise<ValidatedBillingPrice> {
  const plan = getBillingPlan(planId);

  return resolveValidatedBillingPrice({
    planId,
    stripeLookupKey: plan.stripeLookupKey,
    currency: plan.currency,
    interval: plan.interval,
    unitAmount: plan.unitAmount,
  });
}

//************************************************************** */

export async function resolveBillingAdditionalUserPrice(
  planId: BillingPlanId,
): Promise<ValidatedBillingPrice> {
  const plan = getBillingPlan(planId);
  const additionalUserPricing = plan.additionalUserPricing;

  if (!additionalUserPricing) {
    throw new AppError(
      400,
      "Additional users are not available on this plan.",
      {
        code: "BILLING_ADDITIONAL_USERS_UNSUPPORTED",
      },
    );
  }

  return resolveValidatedBillingPrice({
    planId,
    stripeLookupKey: additionalUserPricing.stripeLookupKey,
    currency: plan.currency,
    interval: plan.interval,
    unitAmount: additionalUserPricing.unitAmount,
  });
}

//************************************************************** */