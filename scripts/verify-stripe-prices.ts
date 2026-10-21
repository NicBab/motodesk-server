import { env } from "../src/config/env.js";

import { AppError } from "../src/platform/errors/app-error.js";

import {
  BILLING_PLAN_IDS,
  getBillingPlan,
} from "../src/modules/billing/billing.constants.js";

import { resolveBillingPrice } from "../src/modules/billing/billing-price.service.js";

//************************************************************** */

async function main(): Promise<void> {
  if (env.STRIPE_MODE !== "test") {
    console.error("This verification script requires STRIPE_MODE=test.");

    process.exitCode = 1;
    return;
  }

  console.log("Checking MotoDesk Stripe sandbox prices...\n");

  const results = await Promise.allSettled(
    BILLING_PLAN_IDS.map(async (planId) => {
      const price = await resolveBillingPrice(planId);

      return {
        planId,
        stripePriceId: price.stripePriceId,
      };
    }),
  );

  const rows = results.map((result, index) => {
    const planId = BILLING_PLAN_IDS[index]!;
    const plan = getBillingPlan(planId);

    if (result.status === "fulfilled") {
      return {
        plan: plan.name,
        lookupKey: plan.stripeLookupKey,
        monthlyUSD: (plan.unitAmount / 100).toFixed(2),
        status: "PASS",
        priceId: result.value.stripePriceId,
        error: "",
      };
    }

    const error: unknown = result.reason;

    return {
      plan: plan.name,
      lookupKey: plan.stripeLookupKey,
      monthlyUSD: (plan.unitAmount / 100).toFixed(2),
      status: "FAIL",
      priceId: "",
      error:
        error instanceof AppError
          ? (error.code ?? "BILLING_CONFIGURATION_ERROR")
          : "STRIPE_REQUEST_FAILED",
    };
  });

  console.table(rows);

  const failedCount = results.filter(
    (result) => result.status === "rejected",
  ).length;

  if (failedCount > 0) {
    console.error(
      `\n${failedCount} price check(s) failed. Check the sandbox API key, lookup keys, and recurring price settings.`,
    );

    process.exitCode = 1;
    return;
  }

  console.log("\nAll three sandbox prices match the MotoDesk billing catalog.");
}

//************************************************************** */

main().catch(() => {
  // Avoid printing SDK errors that may contain request details.
  console.error("Stripe price verification could not complete.");

  process.exitCode = 1;
});
