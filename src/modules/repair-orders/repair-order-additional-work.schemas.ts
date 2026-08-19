import { z } from "zod";

//************************************************************** */
// Send Additional Work To Parts Review

export const sendAdditionalWorkToPartsReviewSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(
      1,
      "A reason for returning the repair order to parts review is required.",
    )
    .max(2000),
});

//************************************************************** */

export type SendAdditionalWorkToPartsReviewInput = z.infer<
  typeof sendAdditionalWorkToPartsReviewSchema
>;
