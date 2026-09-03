import { z } from "zod";

//************************************************************** */

export const reportModeSchema = z.enum(["month", "annual"]);

//************************************************************** */

export const reportOverviewQuerySchema = z
  .object({
    start: z.coerce.date(),

    end: z.coerce.date(),

    mode: reportModeSchema.default("month"),
  })
  .superRefine((value, context) => {
    if (value.end <= value.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,

        path: ["end"],

        message: "Report end must be after report start.",
      });
    }
  });

//************************************************************** */

export type ReportOverviewQueryInput = z.infer<
  typeof reportOverviewQuerySchema
>;

//************************************************************** */
