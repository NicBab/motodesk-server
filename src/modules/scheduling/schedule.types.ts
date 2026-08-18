//************************************************************** */
// Schedule Resource Types

export type ScheduleResourceType =
  | "REPAIR_ORDER";

//************************************************************** */
// Schedule Status

export type ScheduleStatus =
  | "SCHEDULED"
  | "CANCELLED"
  | "COMPLETED";

//************************************************************** */
// Repair Order Schedule Context

export interface RepairOrderScheduleContext {
  organizationId: string;
  repairOrderId: string;
  scheduledDate: Date;
  promisedDate?: Date;
  notes?: string;
}