import { z } from "zod";

//************************************************************** */
// Optional Repair Order Scheduling

export const scheduleRepairOrderSchema =
  z.object({
    scheduledDate:
      z.coerce.date(),

    promisedDate:
      z.coerce
        .date()
        .optional(),

    notes:
      z.string()
        .trim()
        .max(2000)
        .optional(),
  });

  //************************************************************** */
// Reschedule Repair Order

export const rescheduleRepairOrderSchema =
  z.object({
    scheduledDate:
      z.coerce.date(),

    promisedDate:
      z.coerce
        .date()
        .optional(),

    notes:
      z.string()
        .trim()
        .max(2000)
        .optional(),
  });

  //************************************************************** */
// Cancel Schedule

export const cancelScheduleSchema =
  z.object({
    notes:
      z.string()
        .trim()
        .min(
          1,
          "Cancellation notes are required.",
        )
        .max(2000),
  });

//************************************************************** */

export type CancelScheduleInput =
  z.infer<
    typeof cancelScheduleSchema
  >;

//************************************************************** */

export type RescheduleRepairOrderInput =
  z.infer<
    typeof rescheduleRepairOrderSchema
  >;

//************************************************************** */

export type ScheduleRepairOrderInput =
  z.infer<
    typeof scheduleRepairOrderSchema
  >;

//************************************************************** */