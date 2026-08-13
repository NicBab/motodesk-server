import { z } from "zod";

//************************************************************** */

export const vehicleTypeSchema = z.enum([
  "MOTORCYCLE",
  "ATV",
  "UTV",
  "SCOOTER",
  "PWC",
  "SNOWMOBILE",
]);

//************************************************************** */

export const vehicleClassificationSchema = z.enum([
  "NEW",
  "USED",
  "SERVICE",
]);

//************************************************************** */

export const vehicleInventoryStatusSchema = z.enum([
  "AVAILABLE",
  "RESERVED",
  "PENDING_SALE",
  "SOLD",
  "WHOLESALE",
  "UNAVAILABLE",
]);

//************************************************************** */

const vehicleSchema = z.object({
  customerId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  year: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .optional(),

  make: z
    .string()
    .trim()
    .min(
      1,
      "Make is required.",
    )
    .max(100),

  model: z
    .string()
    .trim()
    .min(
      1,
      "Model is required.",
    )
    .max(100),

  trim: z
    .string()
    .trim()
    .max(100)
    .optional(),

  vin: z
    .string()
    .trim()
    .max(100)
    .optional(),

  mileage: z
    .number()
    .int()
    .min(0)
    .optional(),

  color: z
    .string()
    .trim()
    .max(100)
    .optional(),

  licensePlate: z
    .string()
    .trim()
    .max(50)
    .optional(),

  type:
    vehicleTypeSchema.optional(),

  classification:
    vehicleClassificationSchema.default(
      "SERVICE",
    ),

  inventoryStatus:
    vehicleInventoryStatusSchema.default(
      "AVAILABLE",
    ),

  stockNumber: z
    .string()
    .trim()
    .max(100)
    .optional(),

  listPrice: z
    .number()
    .nonnegative()
    .optional(),

  unitCost: z
    .number()
    .nonnegative()
    .optional(),

  salesperson: z
    .string()
    .trim()
    .max(150)
    .optional(),

  notes: z
    .string()
    .trim()
    .max(5000)
    .optional(),
});

//************************************************************** */

export const createVehicleSchema =
  vehicleSchema;

//************************************************************** */

export const updateVehicleSchema =
  vehicleSchema.partial();

//************************************************************** */

export const vehicleIdSchema = z.object({
  vehicleId: z
    .string()
    .trim()
    .min(
      1,
      "Vehicle ID is required.",
    ),
});

//************************************************************** */

export const listVehiclesQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100)
    .optional(),

  customerId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  type:
    vehicleTypeSchema.optional(),

  classification:
    vehicleClassificationSchema.optional(),

  inventoryStatus:
    vehicleInventoryStatusSchema.optional(),

  isActive: z
    .enum([
      "true",
      "false",
    ])
    .transform(
      (value) =>
        value === "true",
    )
    .optional(),
});

//************************************************************** */

export type CreateVehicleInput =
  z.infer<typeof createVehicleSchema>;

export type UpdateVehicleInput =
  z.infer<typeof updateVehicleSchema>;

export type VehicleIdInput =
  z.infer<typeof vehicleIdSchema>;

export type ListVehiclesQueryInput =
  z.infer<typeof listVehiclesQuerySchema>;