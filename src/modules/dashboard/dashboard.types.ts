//************************************************************** */

export interface DashboardSummary {
  openRepairOrders: number;

  vehiclesInShop: number;

  lowStockAlerts: number;

  completedThisMonth: number;
}

//************************************************************** */

export interface DashboardWorkflowSummary {
  awaitingApproval: number;

  waitingOnParts: number;

  readyToWork: number;

  readyForPickup: number;
}

//************************************************************** */

export interface DashboardSalesSummary {
  grossSales: number;

  returnsTotal: number;

  netSales: number;

  returnRate: number;

  averageSale: number;

  saleCount: number;
}

//************************************************************** */

export interface DashboardPartsDemandSummary {
  toBeOrdered: number;

  backordered: number;
}

//************************************************************** */

export interface DashboardRecentRepairOrderActivity {
  id: string;

  roNumber: number;

  status: string;

  priority: string;

  customerName: string;

  vehicleDescription: string;

  updatedAt: string;
}

//************************************************************** */

export interface DashboardLowStockPart {
  id: string;

  partNumber: string;

  description: string;

  location: string | null;

  qtyOnHand: number;

  qtyAllocated: number;

  qtyOnOrder: number;

  reorderPoint: number;
}

//************************************************************** */

export interface DashboardExpectedDelivery {
  id: string;

  poNumber: number;

  vendorId: string;

  vendorName: string;

  status: string;

  expectedAt: string;

  orderedAt: string | null;

  lineCount: number;

  remainingQuantity: number;
}

//************************************************************** */

export interface DashboardOverview {
  summary: DashboardSummary;

  workflow: DashboardWorkflowSummary;

  salesMtd: DashboardSalesSummary;

  partsDemand: DashboardPartsDemandSummary;

  recentActivity: DashboardRecentRepairOrderActivity[];

  lowStockParts: DashboardLowStockPart[];

  expectedDeliveries: DashboardExpectedDelivery[];
}

//************************************************************** */