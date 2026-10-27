import { z } from "zod";

import {
  BILLING_PLAN_IDS,
} from "./billing.constants.js";

//************************************************************** */

export const createBillingCheckoutSchema = z.strictObject({
  planId: z.enum(BILLING_PLAN_IDS),
});

export type CreateBillingCheckoutInput = z.infer<
  typeof createBillingCheckoutSchema
>;

//************************************************************** */

export const createBillingPortalSchema = z.strictObject({});

export type CreateBillingPortalInput = z.infer<
  typeof createBillingPortalSchema
>;

//************************************************************** */

// Total additional users beyond Pro's ten included users.
// For example, 2 means a purchased capacity of twelve users.
//
// This is a target quantity, not an increment. Repeating a
// request must never accidentally add the quantity twice.
export const createBillingUserCapacityPreviewSchema =
  z.strictObject({
    additionalUserQuantity: z
      .number()
      .int()
      .min(0)
      .max(2_147_483_647),
  });

export type CreateBillingUserCapacityPreviewInput = z.infer<
  typeof createBillingUserCapacityPreviewSchema
>;

//************************************************************** */

// Confirm a server-created preview. Pricing and subscription
// identifiers are resolved from its stored record.
export const confirmBillingUserCapacityChangeSchema =
  z.strictObject({
    changeId: z.uuid(),
  });

export type ConfirmBillingUserCapacityChangeInput = z.infer<
  typeof confirmBillingUserCapacityChangeSchema
>;

//************************************************************** */