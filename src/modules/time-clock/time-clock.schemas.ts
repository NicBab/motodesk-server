import { z } from "zod";

//************************************************************** */

const timeClockPinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, "Time Clock PIN must contain 4 to 8 digits.");

//************************************************************** */

export const timeClockEmployeeParamsSchema = z.object({
  employeeId: z.string().trim().min(1, "Employee ID is required."),
});

//************************************************************** */

export const timeClockEntryParamsSchema = z.object({
  timeEntryId: z.string().trim().min(1, "Time entry ID is required."),
});

//************************************************************** */

export const timeClockActionSchema = z.object({
  pin: timeClockPinSchema,
});

//************************************************************** */

export const createManualTimeEntrySchema = z.object({
  employeeId: z.string().trim().min(1, "Employee ID is required."),

  clockInAt: z.coerce.date(),

  clockOutAt: z.coerce.date(),

  breakMinutes: z.number().int().min(0).default(0),

  notes: z.string().trim().max(2000).optional(),

  reason: z
    .string()
    .trim()
    .min(1, "A reason is required for a manual time entry.")
    .max(1000),
});

//************************************************************** */

export const correctTimeEntrySchema = z
  .object({
    clockInAt: z.coerce.date().optional(),

    clockOutAt: z.union([z.coerce.date(), z.null()]).optional(),

    breakMinutes: z.number().int().min(0).optional(),

    notes: z.string().trim().max(2000).nullable().optional(),

    reason: z
      .string()
      .trim()
      .min(1, "A correction reason is required.")
      .max(1000),
  })
  .refine(
    (value) =>
      value.clockInAt !== undefined ||
      value.clockOutAt !== undefined ||
      value.breakMinutes !== undefined ||
      value.notes !== undefined,
    {
      message: "At least one time entry field must be changed.",
    },
  );

//************************************************************** */

export const timeClockReportRangeSchema = z.enum([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "ANNUAL",
  "CUSTOM",
]);

//************************************************************** */

export const timeClockReportQuerySchema = z
  .object({
    range: timeClockReportRangeSchema.default("WEEKLY"),

    employeeId: z.string().trim().min(1).optional(),

    includeInactive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default(false),

    anchorDate: z.string().trim().optional(),

    startDate: z.string().trim().optional(),

    endDate: z.string().trim().optional(),
  })
  .superRefine((value, context) => {
    if (value.range === "CUSTOM" && (!value.startDate || !value.endDate)) {
      context.addIssue({
        code: "custom",

        message: "Custom reports require startDate and endDate.",
      });
    }
  });

//************************************************************** */

export type TimeClockEmployeeParamsInput = z.infer<
  typeof timeClockEmployeeParamsSchema
>;

export type TimeClockEntryParamsInput = z.infer<
  typeof timeClockEntryParamsSchema
>;

export type TimeClockActionInput = z.infer<typeof timeClockActionSchema>;

export type CreateManualTimeEntryInput = z.infer<
  typeof createManualTimeEntrySchema
>;

export type CorrectTimeEntryInput = z.infer<typeof correctTimeEntrySchema>;

export type TimeClockReportRange = z.infer<typeof timeClockReportRangeSchema>;

export type TimeClockReportQueryInput = z.infer<
  typeof timeClockReportQuerySchema
>;

//************************************************************** */
