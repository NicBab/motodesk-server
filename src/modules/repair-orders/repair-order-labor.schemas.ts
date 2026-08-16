import { z } from "zod";

//************************************************************** */

const laborLineSchema = z.object({
  technicianMembershipId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  description: z
    .string()
    .trim()
    .min(
      1,
      "Labor description is required.",
    )
    .max(1000),

  hours: z
    .number()
    .nonnegative()
    .default(0),

  rate: z
    .number()
    .nonnegative()
    .default(0),

  completed: z
    .boolean()
    .default(false),
});

//************************************************************** */

export const createRepairOrderLaborLineSchema =
  laborLineSchema;

//************************************************************** */

export const updateRepairOrderLaborLineSchema =
  laborLineSchema.partial();

//************************************************************** */

export const repairOrderLaborLineIdSchema =
  z.object({
    laborLineId: z
      .string()
      .trim()
      .min(
        1,
        "Labor line ID is required.",
      ),
  });

//************************************************************** */

export const repairOrderLaborParamsSchema =
  z.object({
    repairOrderId: z
      .string()
      .trim()
      .min(
        1,
        "Repair Order ID is required.",
      ),

    laborLineId: z
      .string()
      .trim()
      .min(
        1,
        "Labor line ID is required.",
      ),
  });

//************************************************************** */

export type RepairOrderLaborParamsInput =
  z.infer<
    typeof repairOrderLaborParamsSchema
  >;

export type CreateRepairOrderLaborLineInput =
  z.infer<
    typeof createRepairOrderLaborLineSchema
  >;

export type UpdateRepairOrderLaborLineInput =
  z.infer<
    typeof updateRepairOrderLaborLineSchema
  >;

export type RepairOrderLaborLineIdInput =
  z.infer<
    typeof repairOrderLaborLineIdSchema
  >;