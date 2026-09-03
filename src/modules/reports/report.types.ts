//************************************************************** */

export type ReportMode = "month" | "annual";

//************************************************************** */

export type ReportPeriod = {
  start: string;

  end: string;

  mode: ReportMode;
};

//************************************************************** */

export type ReportSummary = {
  totalRevenue: number;

  repairOrderRevenue: number;

  grossPosRevenue: number;

  posReturnTotal: number;

  netPosRevenue: number;

  posSaleCount: number;

  posReturnCount: number;

  posReturnRate: number;

  laborRevenue: number;

  partsRevenue: number;

  shopSuppliesRevenue: number;

  discountTotal: number;

  taxCollected: number;

  billedLaborHours: number;

  employeeClockedHours: number;

  shopEfficiency: number | null;

  averageRepairOrderValue: number;

  averageLaborHoursPerRepairOrder: number;

  repairOrderCount: number;

  cashieredCount: number;

  pickedUpCount: number;
};

//************************************************************** */

export type ReportRevenueTrendPoint = {
  label: string;

  repairOrderRevenue: number;

  posRevenue: number;

  totalRevenue: number;
};

//************************************************************** */

export type ReportStatusDistributionItem = {
  status: string;

  count: number;
};

//************************************************************** */

export type ReportLaborPartsBreakdown = {
  laborRevenue: number;

  partsRevenue: number;
};

//************************************************************** */

export type ReportTechnicianPerformance = {
  membershipId: string;

  name: string;

  repairOrderCount: number;

  billedHours: number;

  clockedHours: number;

  efficiency: number | null;

  laborRevenue: number;

  totalRevenue: number;

  averageTicket: number;
};

//************************************************************** */

export type ReportTopCustomer = {
  customerId: string;

  name: string;

  repairOrderCount: number;

  revenue: number;
};

//************************************************************** */

export type ReportTopPart = {
  partId: string | null;

  partNumber: string;

  description: string;

  quantity: number;

  revenue: number;
};

//************************************************************** */

export type ReportCashieredRepairOrder = {
  id: string;

  roNumber: number;

  customerName: string;

  vehicle: string;

  cashieredAt: string;

  cashierName: string | null;

  invoiceTotal: number;

  cashierStatus: string;
};

//************************************************************** */

export type ReportPickedUpRepairOrder = {
  id: string;

  roNumber: number;

  customerName: string;

  vehicle: string;

  pickedUpAt: string;

  releasedBy: string | null;

  pickupRecipient: string | null;

  cashierStatus: string;

  pickupStatus: string;
};

//************************************************************** */

export type ReportPosTransaction = {
  id: string;

  saleNumber: number;

  createdAt: string;

  customerName: string;

  type: string;

  status: string;

  roNumber: number | null;

  paymentMethod: string;

  itemCount: number;

  subtotal: number;

  discountAmount: number;

  taxAmount: number;

  total: number;

  refundedTotal: number;

  cashierName: string | null;
};

//************************************************************** */

export type ReportRepairOrderTransaction = {
  id: string;

  roNumber: number;

  createdAt: string;

  customerId: string;

  customerName: string;

  vehicle: string;

  vin: string | null;

  technicianMembershipId: string | null;

  technicianName: string | null;

  serviceAdvisorMembershipId: string | null;

  serviceAdvisorName: string | null;

  laborHours: number;

  laborRevenue: number;

  partsRevenue: number;

  shopSupplies: number;

  discount: number;

  tax: number;

  total: number;

  status: string;

  priority: string;
};

//************************************************************** */

export type ReportFilterOption = {
  id: string;

  name: string;
};

//************************************************************** */

export type ReportsOverview = {
  period: ReportPeriod;

  summary: ReportSummary;

  revenueTrend: ReportRevenueTrendPoint[];

  laborPartsBreakdown: ReportLaborPartsBreakdown;

  statusDistribution: ReportStatusDistributionItem[];

  technicianPerformance: ReportTechnicianPerformance[];

  topCustomers: ReportTopCustomer[];

  topParts: ReportTopPart[];

  cashieredRepairOrders: ReportCashieredRepairOrder[];

  pickedUpRepairOrders: ReportPickedUpRepairOrder[];

  posTransactions: ReportPosTransaction[];

  repairOrderTransactions: ReportRepairOrderTransaction[];

  filters: {
    years: number[];

    technicians: ReportFilterOption[];

    serviceAdvisors: ReportFilterOption[];
  };
};

//************************************************************** */
