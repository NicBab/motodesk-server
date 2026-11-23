
import {
  getBillingPlan,
  getAdditionalLocationCount,
  getAdditionalLocationMonthlyAmount,
} from "../billing/billing.constants.js";

import type {
  BillingPlanId,
} from "../billing/billing.constants.js";

import type {
  LocationBillingPreview,
  LocationManagementEntitlement,
} from "./location.types.js";

//************************************************************** */

export function getLocationBillingPreview(
  planId: BillingPlanId,
  currentLocations: number,
  requestedLocations: number,
): LocationBillingPreview {
  if (
    !Number.isSafeInteger(currentLocations) ||
    currentLocations < 0 ||
    !Number.isSafeInteger(requestedLocations) ||
    requestedLocations < currentLocations
  ) {
    throw new RangeError(
      "Requested locations must be greater than or equal to current locations.",
    );
  }

  const plan = getBillingPlan(planId);

  const additionalLocationQuantity =
    getAdditionalLocationCount(
      planId,
      requestedLocations,
    );

  return {
    planId,
    includedLocations: plan.locationsIncluded,
    currentLocations,
    requestedLocations,
    additionalLocationQuantity,
    additionalLocationUnitAmount:
      plan.additionalLocationPricing?.unitAmount ?? 0,
    additionalLocationMonthlyAmount:
      getAdditionalLocationMonthlyAmount(
        planId,
        requestedLocations,
      ),
    currency: "usd",
  };
}

//************************************************************** */

export function getLocationManagementEntitlement(
  planId: BillingPlanId,
  activeLocations: number,
  purchasedAdditionalLocations: number,
): LocationManagementEntitlement {
  if (
    !Number.isSafeInteger(activeLocations) ||
    activeLocations < 0 ||
    !Number.isSafeInteger(purchasedAdditionalLocations) ||
    purchasedAdditionalLocations < 0
  ) {
    throw new RangeError(
      "Location quantities must be non-negative safe integers.",
    );
  }

  const plan = getBillingPlan(planId);

  const purchasedCapacity =
    plan.locationsIncluded +
    purchasedAdditionalLocations;

  const availableLocations = Math.max(
    0,
    purchasedCapacity - activeLocations,
  );

  const canPurchaseAdditionalLocations =
    plan.additionalLocationPricing !== null;

  return {
    canCreateLocation:
      availableLocations > 0 ||
      canPurchaseAdditionalLocations,

    includedLocations: plan.locationsIncluded,
    purchasedAdditionalLocations,
    activeLocations,
    availableLocations,

    requiresBillingChange:
      availableLocations === 0 &&
      canPurchaseAdditionalLocations,
  };
}

//************************************************************** */
