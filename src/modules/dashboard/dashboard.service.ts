import {
  decimalToNumber,
  getCustomerName,
  getVehicleDescription,
  roundMoney,
} from "../reports/report.calculations.js";

import { getDashboardRepositoryData } from "./dashboard.repository.js";

import type {
  DashboardExpectedDelivery,
  DashboardLowStockPart,
  DashboardOverview,
  DashboardRecentRepairOrderActivity,
} from "./dashboard.types.js";

//************************************************************** */

export async function getDashboardOverview(
  organizationId: string,
): Promise<DashboardOverview> {
  const now = new Date();

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  //************************************************************** */

  const data = await getDashboardRepositoryData(
    organizationId,
    monthStart,
    monthEnd,
    now,
  );

  //************************************************************** */
  // Open ROs / vehicles in shop

  const openRepairOrderCount = data.openRepairOrders.length;

  const vehicleIds = new Set(
    data.openRepairOrders
      .map((repairOrder) => repairOrder.vehicleId)
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId)),
  );

  //************************************************************** */
  // Month-to-date sales
  //
  // Sale rows are the production transaction record.
  //
  // REFUND rows are separate transactions, so they are subtracted
  // once here. We do NOT also subtract refundedTotal from the
  // original sale, which would double-count the same refund.

  const completedSales = data.monthSales.filter(
    (sale) => sale.type !== "REFUND" && sale.status !== "VOID",
  );

  const refundSales = data.monthSales.filter(
    (sale) => sale.type === "REFUND" && sale.status !== "VOID",
  );

  const grossSales = completedSales.reduce(
    (total, sale) => total + decimalToNumber(sale.total),
    0,
  );

  const returnsTotal = refundSales.reduce(
    (total, sale) => total + Math.abs(decimalToNumber(sale.total)),
    0,
  );

  const netSales = grossSales - returnsTotal;

  const saleCount = completedSales.length;

  const returnRate = grossSales > 0 ? (returnsTotal / grossSales) * 100 : 0;

  const averageSale = saleCount > 0 ? grossSales / saleCount : 0;

  //************************************************************** */
  // Recent activity

  const recentActivity: DashboardRecentRepairOrderActivity[] =
    data.recentRepairOrders.map((repairOrder) => ({
      id: repairOrder.id,

      roNumber: repairOrder.roNumber,

      status: repairOrder.status,

      priority: repairOrder.priority,

      customerName: getCustomerName(repairOrder.customer),

      vehicleDescription: getVehicleDescription(repairOrder.vehicle),

      updatedAt: repairOrder.updatedAt.toISOString(),
    }));

  //************************************************************** */
  // Low stock

  const lowStockParts: DashboardLowStockPart[] = data.lowStockParts.map(
    (part) => ({
      id: part.id,

      partNumber: part.partNumber,

      description: part.description,

      location: part.location,

      qtyOnHand: decimalToNumber(part.qtyOnHand),

      qtyAllocated: decimalToNumber(part.qtyAllocated),

      qtyOnOrder: decimalToNumber(part.qtyOnOrder),

      reorderPoint: decimalToNumber(part.reorderPoint),
    }),
  );

  //************************************************************** */
  // Expected PO deliveries

  const expectedDeliveries: DashboardExpectedDelivery[] =
    data.expectedDeliveries
      .filter((purchaseOrder) => purchaseOrder.expectedAt !== null)
      .map((purchaseOrder) => {
        const remainingQuantity = purchaseOrder.lines.reduce((total, line) => {
          const ordered = decimalToNumber(line.orderedQty);

          const received = decimalToNumber(line.receivedQty);

          return total + Math.max(0, ordered - received);
        }, 0);

        return {
          id: purchaseOrder.id,

          poNumber: purchaseOrder.poNumber,

          vendorId: purchaseOrder.vendorId,

          vendorName: purchaseOrder.vendor.name,

          status: purchaseOrder.status,

          expectedAt: purchaseOrder.expectedAt!.toISOString(),

          orderedAt: purchaseOrder.orderedAt
            ? purchaseOrder.orderedAt.toISOString()
            : null,

          lineCount: purchaseOrder.lines.length,

          remainingQuantity: roundQuantity(remainingQuantity),
        };
      });

  //************************************************************** */

  return {
    summary: {
      openRepairOrders: openRepairOrderCount,

      vehiclesInShop: vehicleIds.size,

      lowStockAlerts: data.lowStockAlertCount,

      completedThisMonth: data.completedThisMonth,
    },

    workflow: {
      awaitingApproval: data.awaitingApproval,

      waitingOnParts: data.waitingOnParts,

      readyToWork: data.readyToWork,

      readyForPickup: data.readyForPickup,
    },

    salesMtd: {
      grossSales: roundMoney(grossSales),

      returnsTotal: roundMoney(returnsTotal),

      netSales: roundMoney(netSales),

      returnRate: roundPercentage(returnRate),

      averageSale: roundMoney(averageSale),

      saleCount,
    },

    partsDemand: {
      toBeOrdered: data.toBeOrdered,

      backordered: data.backordered,
    },

    recentActivity,

    lowStockParts,

    expectedDeliveries,
  };
}

//************************************************************** */

function roundPercentage(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

//************************************************************** */

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

//************************************************************** */
