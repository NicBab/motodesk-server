import { z } from "zod";

import { EmployeeRole, EmployeeStatus } from "../../generated/prisma/client.js";

//************************************************************** */

const employeePinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, "Time Clock PIN must contain 4 to 8 digits.");

//************************************************************** */

const employeeSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),

  lastName: z.string().trim().min(1, "Last name is required.").max(100),

  role: z.nativeEnum(EmployeeRole),

  status: z.nativeEnum(EmployeeStatus).default("ACTIVE"),

  phone: z.string().trim().max(50).optional(),

  email: z
    .string()
    .trim()
    .email("A valid email address is required.")
    .optional(),

  hourlyRate: z
    .number()
    .nonnegative("Hourly rate cannot be negative.")
    .default(0),

  laborRate: z
    .number()
    .nonnegative("Labor rate cannot be negative.")
    .default(0),

  hireDate: z.coerce.date().optional(),

  pin: employeePinSchema.optional(),

  membershipId: z.string().trim().min(1).optional(),

  isSchedulable: z.boolean().default(true),

  dailyStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must use HH:MM format.")
    .default("08:00"),

  dailyEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "End time must use HH:MM format.")
    .default("17:00"),

  maxDailyHours: z.number().positive().max(24).default(8),

  skills: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export const createEmployeeSchema = employeeSchema;

//************************************************************** */

export const updateEmployeeSchema = employeeSchema.partial().extend({
  pin: employeePinSchema.nullable().optional(),

  membershipId: z.string().trim().min(1).nullable().optional(),

  hireDate: z.coerce.date().nullable().optional(),
});

//************************************************************** */

export const employeeIdSchema = z.object({
  employeeId: z.string().trim().min(1, "Employee ID is required."),
});

//************************************************************** */

export const listEmployeesQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),

  role: z.nativeEnum(EmployeeRole).optional(),

  status: z.nativeEnum(EmployeeStatus).optional(),

  isSchedulable: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

//************************************************************** */

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export type EmployeeIdInput = z.infer<typeof employeeIdSchema>;

export type ListEmployeesQueryInput = z.infer<typeof listEmployeesQuerySchema>;

//************************************************************** */
