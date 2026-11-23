
//************************************************************** */
// Location Management Types
//************************************************************** */

import type {
  ShopLocationStatus,
} from "../../generated/prisma/client.js";

//************************************************************** */

export interface CreateShopLocationInput {
  name: string;
  code: string;

  email?: string | null;
  phone?: string | null;

  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;

  country?: string;
  timezone?: string;
}

//************************************************************** */

export interface UpdateShopLocationInput {
  name?: string;
  code?: string;

  email?: string | null;
  phone?: string | null;

  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;

  country?: string;
  timezone?: string;
}

//************************************************************** */

export interface ShopLocationSummary {
  id: string;
  organizationId: string;

  name: string;
  code: string;

  isDefault: boolean;
  status: ShopLocationStatus;

  assignedEmployeeCount: number;
}

//************************************************************** */

export interface AssignLocationEmployeesInput {
  locationId: string;

  // Existing organization memberships.
  // One membership can be assigned to multiple locations.
  membershipIds: string[];
}

//************************************************************** */

export interface LocationEmployeeAssignment {
  membershipId: string;
  locationId: string;
  organizationId: string;
}

//************************************************************** */

export interface LocationBillingPreview {
  planId: string;

  includedLocations: number;
  currentLocations: number;
  requestedLocations: number;

  additionalLocationQuantity: number;
  additionalLocationUnitAmount: number;

  // Monthly amount in cents.
  additionalLocationMonthlyAmount: number;

  currency: "usd";
}

//************************************************************** */

export interface LocationManagementEntitlement {
  canCreateLocation: boolean;

  includedLocations: number;
  purchasedAdditionalLocations: number;

  activeLocations: number;
  availableLocations: number;

  requiresBillingChange: boolean;
}

//************************************************************** */
