import { z } from "zod";

//************************************************************** */
// Schedule Status

export const scheduleStatusSchema = z.enum([
  "TENTATIVE",
  "SCHEDULED",
  "CONFIRMED",
  "READY",
  "IN_PROGRESS",
  "PAUSED",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
  "MISSED",
  "RESCHEDULE_REQUIRED",
]);

//************************************************************** */
// Schedule Repair Order

export const scheduleRepairOrderSchema = z
  .object({
    technicianEmployeeId: z.string().trim().min(1, "Technician is required."),

    laborLineId: z.string().trim().min(1).optional(),

    scheduledDate: z.coerce.date(),

    scheduledEnd: z.coerce.date(),

    promisedDate: z.coerce.date().optional(),

    status: scheduleStatusSchema.optional(),

    waitingCustomer: z.boolean().optional(),

    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    if (value.scheduledEnd <= value.scheduledDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,

        path: ["scheduledEnd"],

        message: "Scheduled end must be after scheduled start.",
      });
    }
  });

//************************************************************** */
// Reschedule Repair Order

export const rescheduleRepairOrderSchema = z
  .object({
    technicianEmployeeId: z.string().trim().min(1, "Technician is required."),

    laborLineId: z.string().trim().min(1).nullable().optional(),

    scheduledDate: z.coerce.date(),

    scheduledEnd: z.coerce.date(),

    promisedDate: z.coerce.date().optional(),

    waitingCustomer: z.boolean().optional(),

    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    if (value.scheduledEnd <= value.scheduledDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,

        path: ["scheduledEnd"],

        message: "Scheduled end must be after scheduled start.",
      });
    }
  });

//************************************************************** */
// Cancel Schedule

export const cancelScheduleSchema = z.object({
  notes: z.string().trim().min(1, "Cancellation notes are required.").max(2000),
});

//************************************************************** */
// Dispatch Board Query
//
// The client supplies explicit date boundaries so Scheduling
// does not make assumptions about the shop's local timezone.

export const scheduleBoardQuerySchema = z
  .object({
    start: z.coerce.date(),

    end: z.coerce.date(),
  })
  .superRefine((value, context) => {
    if (value.end <= value.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,

        path: ["end"],

        message: "Board end must be after board start.",
      });
    }
  });

//************************************************************** */

export type CancelScheduleInput = z.infer<typeof cancelScheduleSchema>;

export type RescheduleRepairOrderInput = z.infer<
  typeof rescheduleRepairOrderSchema
>;

export type ScheduleRepairOrderInput = z.infer<
  typeof scheduleRepairOrderSchema
>;

export type ScheduleBoardQueryInput = z.infer<typeof scheduleBoardQuerySchema>;

//************************************************************** */
