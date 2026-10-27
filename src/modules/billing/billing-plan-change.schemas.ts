import { z } from "zod";

import {
  BILLING_PLAN_IDS,
} from "./billing.constants.js";

//************************************************************** */

// Preview a change to the existing subscription.
//
// Additional-user quantity is the desired total beyond Pro's
// ten included users, not an increment.
//
// Prices, Stripe identifiers, billing behavior, and organization
// identity are resolved by the server.
export const createBillingPlanChangePreviewSchema = z
  .strictObject({
    planId: z.enum(BILLING_PLAN_IDS),

    additionalUserQuantity: z
      .number()
      .int()
      .min(0)
      .max(2_147_483_647)
      .default(0),
  })
  .superRefine((input, context) => {
    if (
      input.planId !== "pro" &&
      input.additionalUserQuantity !== 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["additionalUserQuantity"],
        message:
          "Additional users are only available on the Pro plan.",
      });
    }
  });

export type CreateBillingPlanChangePreviewInput = z.infer<
  typeof createBillingPlanChangePreviewSchema
>;

//************************************************************** */

// Confirmation references the immutable server-created preview.
// Never accept replacement prices or Stripe update parameters
// from the client during confirmation.
export const confirmBillingPlanChangeSchema = z.strictObject({
  changeId: z.uuid(),
});

export type ConfirmBillingPlanChangeInput = z.infer<
  typeof confirmBillingPlanChangeSchema
>;

//************************************************************** */