//************************************************************** */

export const BILLING_PLAN_IDS = [
  "starter",
  "business",
  "pro",
] as const;

export type BillingPlanId =
  (typeof BILLING_PLAN_IDS)[number];

//************************************************************** */

export interface AdditionalUserPricing {
  readonly stripeLookupKey: string;
  readonly unitAmount: number;
}

export interface BillingPlanDefinition {
  readonly id: BillingPlanId;
  readonly name: string;
  readonly stripeLookupKey: string;
  readonly currency: "usd";
  readonly interval: "month";
  readonly unitAmount: number;
  readonly usersIncluded: number;
  readonly additionalUserPricing: AdditionalUserPricing | null;
  readonly trialDays: number;
  readonly recommended: boolean;
}

//************************************************************** */

export const BILLING_PLANS = {
  starter: {
    id: "starter",
    name: "Starter",
    stripeLookupKey: "starter-monthly",
    currency: "usd",
    interval: "month",
    unitAmount: 8_900,
    usersIncluded: 2,
    additionalUserPricing: null,
    trialDays: 14,
    recommended: false,
  },

  business: {
    id: "business",
    name: "Business",
    stripeLookupKey: "business-monthly",
    currency: "usd",
    interval: "month",
    unitAmount: 18_900,
    usersIncluded: 5,
    additionalUserPricing: null,
    trialDays: 14,
    recommended: true,
  },

  pro: {
    id: "pro",
    name: "Pro",
    stripeLookupKey: "pro-monthly",
    currency: "usd",
    interval: "month",
    unitAmount: 29_900,
    usersIncluded: 10,

    additionalUserPricing: {
      stripeLookupKey: "pro-additional-user-monthly",
      unitAmount: 1_000,
    },

    trialDays: 14,
    recommended: false,
  },
} as const satisfies Readonly<
  Record<BillingPlanId, BillingPlanDefinition>
>;

//************************************************************** */

export function isBillingPlanId(
  value: unknown,
): value is BillingPlanId {
  return (
    typeof value === "string" &&
    BILLING_PLAN_IDS.some((planId) => planId === value)
  );
}

//************************************************************** */

export function getBillingPlan(
  planId: BillingPlanId,
): BillingPlanDefinition {
  return BILLING_PLANS[planId];
}

//************************************************************** */