import { z } from "zod";

//************************************************************** */

export const repairOrderStatusSchema = z.enum([
  "ESTIMATE",
  "AWAITING_CUSTOMER_APPROVAL",
  "APPROVED",
  "PARTS_REVIEW",
  "WAITING_ON_PARTS",
  "READY_TO_WORK",
  "SCHEDULED",
  "IN_PROGRESS",
  "PAUSED",
  "WAITING_ON_ADDITIONAL_APPROVAL",
  "WAITING_ON_ADDITIONAL_PARTS",
  "WORK_COMPLETE",
  "QUALITY_CHECK",
  "READY_FOR_PICKUP",
  "CASHIERED",
  "COMPLETED",
  "PICKED_UP",
  "CLOSED",
  "CANCELLED",
]);

//************************************************************** */

export const repairOrderPrioritySchema = z.enum([
  "STANDARD",
  "RUSH",
  "EMERGENCY",
  "HOLD",
]);

//************************************************************** */

export const repairOrderApprovalMethodSchema = z.enum([
  "PHONE",
  "SMS",
  "EMAIL",
  "CUSTOMER_PORTAL",
  "IN_PERSON",
]);

//************************************************************** */

export const repairOrderCashierStatusSchema = z.enum([
  "NOT_CASHIERED",
  "IN_PROGRESS",
  "COMPLETED",
  "VOIDED",
  "REVERSED",
]);

//************************************************************** */

export const repairOrderPickupStatusSchema = z.enum([
  "NOT_READY",
  "READY",
  "COMPLETED",
  "REVERSED",
]);

//************************************************************** */

const repairOrderSchema = z.object({
  customerId: z.string().trim().min(1, "Customer ID is required."),

  vehicleId: z.string().trim().min(1, "Vehicle ID is required."),

  status: repairOrderStatusSchema.default("ESTIMATE"),

  priority: repairOrderPrioritySchema.default("STANDARD"),

  serviceAdvisorMembershipId: z.string().trim().min(1).optional(),

  primaryTechnicianMembershipId: z.string().trim().min(1).optional(),

  promisedDate: z.coerce.date().optional(),

  scheduledDate: z.coerce.date().optional(),

  complaint: z.string().trim().max(5000).optional(),

  notes: z.string().trim().max(10000).optional(),

  taxRate: z.number().min(0).max(100).optional(),

  shopSuppliesRate: z.number().min(0).max(100).default(6),

  discount: z.number().nonnegative().default(0),

  deposit: z.number().nonnegative().default(0),

  approvalMethod: repairOrderApprovalMethodSchema.optional(),

  approvalDate: z.coerce.date().optional(),

  approvedBy: z.string().trim().max(200).optional(),

  approvedAmount: z.number().nonnegative().optional(),

  approvalNotes: z.string().trim().max(5000).optional(),

  cashierStatus: repairOrderCashierStatusSchema.default("NOT_CASHIERED"),

  cashieredDate: z.coerce.date().optional(),

  paymentReference: z.string().trim().max(250).optional(),

  paymentRemote: z.boolean().default(false),

  remainingBalance: z.number().nonnegative().default(0),

  pickupStatus: repairOrderPickupStatusSchema.default("NOT_READY"),

  pickupDate: z.coerce.date().optional(),

  pickupRecipient: z.string().trim().max(200).optional(),

  pickupNotes: z.string().trim().max(5000).optional(),
});

//************************************************************** */

export const createRepairOrderSchema = repairOrderSchema;

//************************************************************** */

export const updateRepairOrderSchema = repairOrderSchema
  .omit({
    customerId: true,
    vehicleId: true,
    status: true,
  })
  .partial();

//************************************************************** */

export const repairOrderIdSchema = z.object({
  repairOrderId: z.string().trim().min(1, "Repair Order ID is required."),
});

//************************************************************** */

export const updateRepairOrderStatusSchema = z.object({
  status: repairOrderStatusSchema,

  notes: z.string().trim().max(5000).optional(),

  automatic: z.boolean().default(false),
});

//************************************************************** */

export const listRepairOrdersQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),

  customerId: z.string().trim().min(1).optional(),

  vehicleId: z.string().trim().min(1).optional(),

  status: repairOrderStatusSchema.optional(),

  priority: repairOrderPrioritySchema.optional(),

  serviceAdvisorMembershipId: z.string().trim().min(1).optional(),

  primaryTechnicianMembershipId: z.string().trim().min(1).optional(),

  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

//************************************************************** */

export const beginRepairOrderQualityCheckSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export const passRepairOrderQualityCheckSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export const failRepairOrderQualityCheckSchema = z.object({
  notes: z.string().trim().min(1, "QC failure notes are required.").max(2000),
});

//************************************************************** */

export const cashierRepairOrderSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export const pickupRepairOrderSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export const closeRepairOrderSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export const requestRepairOrderApprovalSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

//************************************************************** */

export const approveRepairOrderSchema = z.object({
  approvalMethod: repairOrderApprovalMethodSchema,

  approvedBy: z.string().trim().min(1, "Approved by is required.").max(200),

  approvedAmount: z.number().nonnegative().optional(),

  notes: z.string().trim().max(5000).optional(),
});

//************************************************************** */

export const declineRepairOrderApprovalSchema = z.object({
  notes: z.string().trim().min(1, "Decline notes are required.").max(5000),
});

//************************************************************** */

export const completeRepairOrderPartsReviewSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

export type CompleteRepairOrderPartsReviewInput = z.infer<
  typeof completeRepairOrderPartsReviewSchema
>;

export type RequestRepairOrderApprovalInput = z.infer<
  typeof requestRepairOrderApprovalSchema
>;

export type ApproveRepairOrderInput = z.infer<typeof approveRepairOrderSchema>;

export type DeclineRepairOrderApprovalInput = z.infer<
  typeof declineRepairOrderApprovalSchema
>;

export type CashierRepairOrderInput = z.infer<typeof cashierRepairOrderSchema>;

export type PickupRepairOrderInput = z.infer<typeof pickupRepairOrderSchema>;

export type CloseRepairOrderInput = z.infer<typeof closeRepairOrderSchema>;

export type BeginRepairOrderQualityCheckInput = z.infer<
  typeof beginRepairOrderQualityCheckSchema
>;

export type PassRepairOrderQualityCheckInput = z.infer<
  typeof passRepairOrderQualityCheckSchema
>;

export type FailRepairOrderQualityCheckInput = z.infer<
  typeof failRepairOrderQualityCheckSchema
>;

export type CreateRepairOrderInput = z.infer<typeof createRepairOrderSchema>;

export type UpdateRepairOrderInput = z.infer<typeof updateRepairOrderSchema>;

export type RepairOrderIdInput = z.infer<typeof repairOrderIdSchema>;

export type UpdateRepairOrderStatusInput = z.infer<
  typeof updateRepairOrderStatusSchema
>;

export type ListRepairOrdersQueryInput = z.infer<
  typeof listRepairOrdersQuerySchema
>;
