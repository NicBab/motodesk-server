//************************************************************** */
// Schedule Resource Types

export type ScheduleResourceType = "REPAIR_ORDER";

//************************************************************** */
// Schedule Status

export type ScheduleStatus =
  | "TENTATIVE"
  | "SCHEDULED"
  | "CONFIRMED"
  | "READY"
  | "IN_PROGRESS"
  | "PAUSED"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED"
  | "MISSED"
  | "RESCHEDULE_REQUIRED";

//************************************************************** */
// Repair Order Schedule Context

export interface RepairOrderScheduleContext {
  organizationId: string;

  repairOrderId: string;

  technicianEmployeeId: string;

  laborLineId?: string;

  scheduledDate: Date;

  scheduledEnd: Date;

  promisedDate?: Date;

  status?: ScheduleStatus;

  waitingCustomer?: boolean;

  notes?: string;
}

//************************************************************** */
// Repair Order Reschedule Context

export interface RepairOrderRescheduleContext {
  organizationId: string;

  repairOrderId: string;

  technicianEmployeeId: string;

  laborLineId?: string | null;

  scheduledDate: Date;

  scheduledEnd: Date;

  promisedDate?: Date;

  waitingCustomer?: boolean;

  notes?: string;
}

//************************************************************** */
// Schedule Date Range

export interface ScheduleDateRange {
  start: Date;

  end: Date;
}

//************************************************************** */
