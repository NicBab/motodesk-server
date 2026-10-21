//************************************************************** */

export const BILLING_PLAN_IDS = [
  "starter",
  "business",
  "pro",
] as const;

export type BillingPlanId =
  (typeof BILLING_PLAN_IDS)[number];

//************************************************************** */

export interface BillingPlanDefinition {
  readonly id: BillingPlanId;
  readonly name: string;
  readonly stripeLookupKey: string;
  readonly currency: "usd";
  readonly interval: "month";
  readonly unitAmount: number;
  readonly usersIncluded: number;
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