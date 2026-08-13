import { z } from "zod";

import {
  emailSchema,
  nameSchema,
  optionalPhoneSchema,
} from "../auth/shared/validation/index.js";

//************************************************************** */

export const customerTypeSchema = z.enum(["INDIVIDUAL", "BUSINESS"]);

//************************************************************** */

const customerSchema = z.object({
  type: customerTypeSchema.default("INDIVIDUAL"),

  firstName: nameSchema.optional(),

  lastName: nameSchema.optional(),

  companyName: z
    .string()
    .trim()
    .min(1, "Company name is required.")
    .max(150, "Company name cannot exceed 150 characters.")
    .optional(),

  email: emailSchema.optional(),

  phone: optionalPhoneSchema,

  alternatePhone: optionalPhoneSchema,

  addressLine1: z.string().trim().max(200).optional(),

  addressLine2: z.string().trim().max(200).optional(),

  city: z.string().trim().max(100).optional(),

  state: z.string().trim().max(100).optional(),

  postalCode: z.string().trim().max(30).optional(),

  country: z.string().trim().max(100).optional(),

  notes: z.string().trim().max(5000).optional(),
});

//************************************************************** */

export const createCustomerSchema = customerSchema.superRefine(
  (data, context) => {
    if (data.type === "INDIVIDUAL" && !data.firstName && !data.lastName) {
      context.addIssue({
        code: "custom",
        path: ["firstName"],
        message: "An individual customer requires a first or last name.",
      });
    }

    if (data.type === "BUSINESS" && !data.companyName) {
      context.addIssue({
        code: "custom",
        path: ["companyName"],
        message: "A business customer requires a company name.",
      });
    }
  },
);

//************************************************************** */

export const updateCustomerSchema = customerSchema.partial();

//************************************************************** */

export const customerIdSchema = z.object({
  customerId: z.string().trim().min(1, "Customer ID is required."),
});

//************************************************************** */

export const listCustomersQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100, "Customer search cannot exceed 100 characters.")
    .optional(),

  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),

  type: customerTypeSchema.optional(),
});

//************************************************************** */

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export type CustomerIdInput = z.infer<typeof customerIdSchema>;

export type ListCustomersQueryInput = z.infer<typeof listCustomersQuerySchema>;
