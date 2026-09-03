import { z } from "zod";

//************************************************************** */

export const serviceAppointmentTypeSchema = z.enum([
  "DROP_OFF",
  "WAITING_CUSTOMER",
  "PICKUP_AND_DELIVERY",
  "MOBILE_SERVICE",
  "INTERNAL_WORK",
  "WALK_IN",
  "PRE_DELIVERY_INSPECTION",
  "WARRANTY",
  "RECALL",
]);

//************************************************************** */

export const serviceAppointmentStatusSchema = z.enum([
  "REQUESTED",
  "TENTATIVE",
  "CONFIRMED",
  "CHECKED_IN",
  "CONVERTED_TO_RO",
  "IN_SERVICE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "RESCHEDULED",
]);

//************************************************************** */

export const serviceAppointmentContactMethodSchema = z.enum([
  "PHONE",
  "SMS",
  "EMAIL",
  "IN_PERSON",
]);

//************************************************************** */

export const createServiceAppointmentSchema = z
  .object({
    customerId: z.string().trim().min(1).optional(),

    vehicleId: z.string().trim().min(1).optional(),

    appointmentType: serviceAppointmentTypeSchema.default("DROP_OFF"),

    requestedService: z
      .string()
      .trim()
      .min(1, "Requested service is required.")
      .max(5000),

    customerComplaint: z.string().trim().max(5000).optional(),

    scheduledStart: z.coerce.date(),

    scheduledEnd: z.coerce.date(),

    estimatedDurationMinutes: z.number().int().positive().max(1440).default(60),

    preferredTechnicianEmployeeId: z.string().trim().min(1).optional(),

    serviceAdvisorEmployeeId: z.string().trim().min(1).optional(),

    waitingCustomer: z.boolean().default(false),

    transportationNeeded: z.boolean().default(false),

    contactMethod: serviceAppointmentContactMethodSchema.optional(),

    internalNotes: z.string().trim().max(10000).optional(),

    customerNotes: z.string().trim().max(10000).optional(),
  })
  .superRefine((value, context) => {
    if (value.scheduledEnd <= value.scheduledStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,

        path: ["scheduledEnd"],

        message: "Scheduled end must be after scheduled start.",
      });
    }
  });

//************************************************************** */

export const listServiceAppointmentsQuerySchema = z
  .object({
    search: z.string().trim().max(150).optional(),

    status: serviceAppointmentStatusSchema.optional(),

    start: z.coerce.date().optional(),

    end: z.coerce.date().optional(),
  })
  .superRefine((value, context) => {
    if (value.start && value.end && value.end <= value.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,

        path: ["end"],

        message: "End must be after start.",
      });
    }
  });

//************************************************************** */

export const serviceAppointmentIdSchema = z.object({
  appointmentId: z.string().trim().min(1, "Appointment ID is required."),
});

//************************************************************** */

export const cancelServiceAppointmentSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export type CreateServiceAppointmentInput = z.infer<
  typeof createServiceAppointmentSchema
>;

export type ListServiceAppointmentsQueryInput = z.infer<
  typeof listServiceAppointmentsQuerySchema
>;

export type ServiceAppointmentIdInput = z.infer<
  typeof serviceAppointmentIdSchema
>;

export type CancelServiceAppointmentInput = z.infer<
  typeof cancelServiceAppointmentSchema
>;

//************************************************************** */
