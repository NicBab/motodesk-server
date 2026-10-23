import { env } from "../src/config/env.js";

import { AppError } from "../src/platform/errors/app-error.js";

import {
  BILLING_PLAN_IDS,
  getBillingPlan,
} from "../src/modules/billing/billing.constants.js";

import {
  resolveBillingAdditionalUserPrice,
  resolveBillingPrice,
  type ValidatedBillingPrice,
} from "../src/modules/billing/billing-price.service.js";

//************************************************************** */

interface PriceCheck {
  label: string;
  lookupKey: string;
  unitAmount: number;
  resolve: () => Promise<ValidatedBillingPrice>;
}

function buildPriceChecks(): PriceCheck[] {
  const checks: PriceCheck[] = [];

  for (const planId of BILLING_PLAN_IDS) {
    const plan = getBillingPlan(planId);

    checks.push({
      label: plan.name,
      lookupKey: plan.stripeLookupKey,
      unitAmount: plan.unitAmount,
      resolve: () => resolveBillingPrice(planId),
    });

    const additionalUserPricing = plan.additionalUserPricing;

    if (additionalUserPricing) {
      checks.push({
        label: `${plan.name} — Additional user`,
        lookupKey: additionalUserPricing.stripeLookupKey,
        unitAmount: additionalUserPricing.unitAmount,
        resolve: () => resolveBillingAdditionalUserPrice(planId),
      });
    }
  }

  return checks;
}

//************************************************************** */

async function main(): Promise<void> {
  if (env.STRIPE_MODE !== "test") {
    console.error(
      "This verification script requires STRIPE_MODE=test.",
    );

    process.exitCode = 1;
    return;
  }

  const checks = buildPriceChecks();

  console.log("Checking MotoDesk Stripe sandbox prices...\n");

  const results = await Promise.allSettled(
    checks.map((check) => check.resolve()),
  );

  const rows = results.map((result, index) => {
    const check = checks[index]!;

    if (result.status === "fulfilled") {
      return {
        price: check.label,
        lookupKey: check.lookupKey,
        monthlyUSD: (check.unitAmount / 100).toFixed(2),
        status: "PASS",
        priceId: result.value.stripePriceId,
        error: "",
      };
    }

    const error: unknown = result.reason;

    return {
      price: check.label,
      lookupKey: check.lookupKey,
      monthlyUSD: (check.unitAmount / 100).toFixed(2),
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

  console.log(
    `\nAll ${checks.length} sandbox prices match the MotoDesk billing catalog.`,
  );
}

//************************************************************** */

main().catch(() => {
  // Avoid exposing raw SDK errors or request details.
  console.error("Stripe price verification could not complete.");

  process.exitCode = 1;
});