import { z } from "zod";

import {
  BILLING_PLAN_IDS,
} from "./billing.constants.js";

//************************************************************** */

export const createBillingCheckoutSchema = z.strictObject({
  planId: z.enum(BILLING_PLAN_IDS),
});

//************************************************************** */

export type CreateBillingCheckoutInput = z.infer<
  typeof createBillingCheckoutSchema
>;

//************************************************************** */

export const createBillingPortalSchema = z.strictObject({});

//************************************************************** */

export type CreateBillingPortalInput = z.infer<
  typeof createBillingPortalSchema
>;

//************************************************************** */