import {
  calculateRepairOrderTotals,
  createTrendBuckets,
  decimalToNumber,
  getCustomerName,
  getPersonName,
  getVehicleDescription,
  isDateInBucket,
  roundHours,
  roundMoney,
} from "./report.calculations.js";

import {
  findReportCashieredRepairOrders,
  findReportPickedUpRepairOrders,
  findReportRepairOrders,
  findReportSales,
  findReportTimeEntries,
  findReportYearSources,
} from "./report.repository.js";

import type { ReportOverviewQueryInput } from "./report.schemas.js";

import type {
  ReportFilterOption,
  ReportRepairOrderTransaction,
  ReportsOverview,
  ReportTechnicianPerformance,
  ReportTopCustomer,
  ReportTopPart,
} from "./report.types.js";

//************************************************************** */

type ReportRepairOrder = Awaited<
  ReturnType<typeof findReportRepairOrders>
>[number];

type ReportTimeEntry = Awaited<
  ReturnType<typeof findReportTimeEntries>
>[number];

//************************************************************** */

export async function getReportOverview(
  organizationId: string,
  query: ReportOverviewQueryInput,
): Promise<ReportsOverview> {
  const [
    repairOrders,
    sales,
    timeEntries,
    cashieredRepairOrders,
    pickedUpRepairOrders,
    yearSources,
  ] = await Promise.all([
    findReportRepairOrders(organizationId, query.start, query.end),

    findReportSales(organizationId, query.start, query.end),

    findReportTimeEntries(organizationId, query.start, query.end),

    findReportCashieredRepairOrders(organizationId, query.start, query.end),

    findReportPickedUpRepairOrders(organizationId, query.start, query.end),

    findReportYearSources(organizationId),
  ]);

  //************************************************************** */
  // Repair Order Financials

  const repairOrderTotals = new Map<
    string,
    ReturnType<typeof calculateRepairOrderTotals>
  >();

  let laborRevenue = 0;

  let partsRevenue = 0;

  let shopSuppliesRevenue = 0;

  let discountTotal = 0;

  let taxCollected = 0;

  let billedLaborHours = 0;

  let repairOrderRevenue = 0;

  for (const repairOrder of repairOrders) {
    const totals = calculateRepairOrderTotals(repairOrder);

    repairOrderTotals.set(repairOrder.id, totals);

    laborRevenue += totals.laborRevenue;

    partsRevenue += totals.partsRevenue;

    shopSuppliesRevenue += totals.shopSuppliesRevenue;

    discountTotal += totals.discount;

    taxCollected += totals.tax;

    billedLaborHours += totals.laborHours;

    repairOrderRevenue += totals.total;
  }

  //************************************************************** */
  // POS Revenue
  //
  // Sale.type RO is intentionally not included here because RO
  // revenue is already represented above. Including it would count
  // the same service transaction twice.

  const posSales = sales.filter(
    (sale) => sale.type === "POS" && sale.status !== "VOID",
  );

  const refundSales = sales.filter(
    (sale) => sale.type === "REFUND" && sale.status !== "VOID",
  );

  const grossPosRevenue = posSales.reduce(
    (total, sale) => total + decimalToNumber(sale.total),
    0,
  );

  const posReturnTotal = refundSales.reduce(
    (total, sale) => total + Math.abs(decimalToNumber(sale.total)),
    0,
  );

  const netPosRevenue = grossPosRevenue - posReturnTotal;

  //************************************************************** */
  // Employee Clock Hours

  const employeeClockedHours =
    timeEntries.reduce(
      (total, entry) => total + (entry.workedMinutes ?? 0),
      0,
    ) / 60;

  const shopEfficiency =
    employeeClockedHours > 0
      ? (billedLaborHours / employeeClockedHours) * 100
      : null;

  //************************************************************** */
  // Revenue Trend

  const revenueTrend = createTrendBuckets(
    query.start,
    query.end,
    query.mode,
  ).map((bucket) => {
    const bucketRepairOrderRevenue = repairOrders
      .filter((repairOrder) => isDateInBucket(repairOrder.createdAt, bucket))
      .reduce(
        (total, repairOrder) =>
          total + (repairOrderTotals.get(repairOrder.id)?.total ?? 0),
        0,
      );

    const bucketGrossPosRevenue = posSales
      .filter((sale) => isDateInBucket(sale.createdAt, bucket))
      .reduce((total, sale) => total + decimalToNumber(sale.total), 0);

    const bucketReturnTotal = refundSales
      .filter((sale) => isDateInBucket(sale.createdAt, bucket))
      .reduce(
        (total, sale) => total + Math.abs(decimalToNumber(sale.total)),
        0,
      );

    const posRevenue = bucketGrossPosRevenue - bucketReturnTotal;

    return {
      label: bucket.label,

      repairOrderRevenue: roundMoney(bucketRepairOrderRevenue),

      posRevenue: roundMoney(posRevenue),

      totalRevenue: roundMoney(bucketRepairOrderRevenue + posRevenue),
    };
  });

  //************************************************************** */
  // RO Status Distribution

  const statusCounts = new Map<string, number>();

  for (const repairOrder of repairOrders) {
    statusCounts.set(
      repairOrder.status,
      (statusCounts.get(repairOrder.status) ?? 0) + 1,
    );
  }

  const statusDistribution = Array.from(statusCounts.entries())
    .map(([status, count]) => ({
      status,

      count,
    }))
    .sort((left, right) => right.count - left.count);

  //************************************************************** */
  // Technician Performance

  const technicianPerformance = buildTechnicianPerformance(
    repairOrders,
    timeEntries,
    repairOrderTotals,
  );

  //************************************************************** */
  // Top Customers / Parts

  const topCustomers = buildTopCustomers(repairOrders, repairOrderTotals);

  const topParts = buildTopParts(repairOrders);

  //************************************************************** */
  // POS Transaction Log

  const posTransactions = sales.map((sale) => ({
    id: sale.id,

    saleNumber: sale.saleNumber,

    createdAt: sale.createdAt.toISOString(),

    customerName: sale.customerName,

    type: sale.type,

    status: sale.status,

    roNumber: sale.roNumber,

    paymentMethod: sale.paymentMethod,

    itemCount: sale.lines.length,

    subtotal: roundMoney(decimalToNumber(sale.subtotal)),

    discountAmount: roundMoney(decimalToNumber(sale.discountAmount)),

    taxAmount: roundMoney(decimalToNumber(sale.taxAmount)),

    total: roundMoney(decimalToNumber(sale.total)),

    refundedTotal: roundMoney(decimalToNumber(sale.refundedTotal)),

    cashierName: sale.cashierName,
  }));

  //************************************************************** */
  // Repair Order Transaction Log

  const repairOrderTransactions: ReportRepairOrderTransaction[] =
    repairOrders.map((repairOrder) => {
      const totals = repairOrderTotals.get(repairOrder.id)!;

      return {
        id: repairOrder.id,

        roNumber: repairOrder.roNumber,

        createdAt: repairOrder.createdAt.toISOString(),

        customerId: repairOrder.customerId,

        customerName: getCustomerName(repairOrder.customer),

        vehicle: getVehicleDescription(repairOrder.vehicle),

        vin: repairOrder.vehicle.vin,

        technicianMembershipId: repairOrder.primaryTechnicianMembershipId,

        technicianName: getPersonName(repairOrder.primaryTechnician?.user),

        serviceAdvisorMembershipId: repairOrder.serviceAdvisorMembershipId,

        serviceAdvisorName: getPersonName(repairOrder.serviceAdvisor?.user),

        laborHours: totals.laborHours,

        laborRevenue: totals.laborRevenue,

        partsRevenue: totals.partsRevenue,

        shopSupplies: totals.shopSuppliesRevenue,

        discount: totals.discount,

        tax: totals.tax,

        total: totals.total,

        status: repairOrder.status,

        priority: repairOrder.priority,
      };
    });

  //************************************************************** */
  // Cashiered Repair Orders

  const cashieredRows = cashieredRepairOrders.map((repairOrder) => {
    const totals = calculateRepairOrderTotals(repairOrder);

    return {
      id: repairOrder.id,

      roNumber: repairOrder.roNumber,

      customerName: getCustomerName(repairOrder.customer),

      vehicle: getVehicleDescription(repairOrder.vehicle),

      cashieredAt: repairOrder.cashieredDate!.toISOString(),

      cashierName: getPersonName(
        repairOrder.statusHistory[0]?.changedByMembership?.user,
      ),

      invoiceTotal: totals.total,

      cashierStatus: repairOrder.cashierStatus,
    };
  });

  //************************************************************** */
  // Picked-Up Repair Orders

  const pickedUpRows = pickedUpRepairOrders.map((repairOrder) => ({
    id: repairOrder.id,

    roNumber: repairOrder.roNumber,

    customerName: getCustomerName(repairOrder.customer),

    vehicle: getVehicleDescription(repairOrder.vehicle),

    pickedUpAt: repairOrder.pickupDate!.toISOString(),

    releasedBy: getPersonName(
      repairOrder.statusHistory[0]?.changedByMembership?.user,
    ),

    pickupRecipient: repairOrder.pickupRecipient,

    cashierStatus: repairOrder.cashierStatus,

    pickupStatus: repairOrder.pickupStatus,
  }));

  //************************************************************** */

  return {
    period: {
      start: query.start.toISOString(),

      end: query.end.toISOString(),

      mode: query.mode,
    },

    summary: {
      totalRevenue: roundMoney(repairOrderRevenue + netPosRevenue),

      repairOrderRevenue: roundMoney(repairOrderRevenue),

      grossPosRevenue: roundMoney(grossPosRevenue),

      posReturnTotal: roundMoney(posReturnTotal),

      netPosRevenue: roundMoney(netPosRevenue),

      posSaleCount: posSales.length,

      posReturnCount: refundSales.length,

      posReturnRate:
        grossPosRevenue > 0
          ? roundMoney((posReturnTotal / grossPosRevenue) * 100)
          : 0,

      laborRevenue: roundMoney(laborRevenue),

      partsRevenue: roundMoney(partsRevenue),

      shopSuppliesRevenue: roundMoney(shopSuppliesRevenue),

      discountTotal: roundMoney(discountTotal),

      taxCollected: roundMoney(taxCollected),

      billedLaborHours: roundHours(billedLaborHours),

      employeeClockedHours: roundHours(employeeClockedHours),

      shopEfficiency:
        shopEfficiency === null ? null : roundMoney(shopEfficiency),

      averageRepairOrderValue:
        repairOrders.length > 0
          ? roundMoney(repairOrderRevenue / repairOrders.length)
          : 0,

      averageLaborHoursPerRepairOrder:
        repairOrders.length > 0
          ? roundHours(billedLaborHours / repairOrders.length)
          : 0,

      repairOrderCount: repairOrders.length,

      cashieredCount: cashieredRepairOrders.length,

      pickedUpCount: pickedUpRepairOrders.length,
    },

    revenueTrend,

    laborPartsBreakdown: {
      laborRevenue: roundMoney(laborRevenue),

      partsRevenue: roundMoney(partsRevenue),
    },

    statusDistribution,

    technicianPerformance,

    topCustomers,

    topParts,

    cashieredRepairOrders: cashieredRows,

    pickedUpRepairOrders: pickedUpRows,

    posTransactions,

    repairOrderTransactions,

    filters: {
      years: buildReportYears(yearSources),

      technicians: createMembershipFilterOptions(repairOrders, "technician"),

      serviceAdvisors: createMembershipFilterOptions(repairOrders, "advisor"),
    },
  };
}

//************************************************************** */
// Technician Performance

function buildTechnicianPerformance(
  repairOrders: ReportRepairOrder[],
  timeEntries: ReportTimeEntry[],
  repairOrderTotals: Map<string, ReturnType<typeof calculateRepairOrderTotals>>,
): ReportTechnicianPerformance[] {
  const performance = new Map<string, ReportTechnicianPerformance>();

  const clockedByMembershipId = new Map<string, number>();

  const clockedByName = new Map<string, number>();

  //************************************************************** */
  // Time Entry Totals

  for (const entry of timeEntries) {
    const hours = (entry.workedMinutes ?? 0) / 60;

    if (entry.employee.membershipId) {
      clockedByMembershipId.set(
        entry.employee.membershipId,

        (clockedByMembershipId.get(entry.employee.membershipId) ?? 0) + hours,
      );
    }

    const normalizedName = normalizeName(entry.employeeName);

    clockedByName.set(
      normalizedName,

      (clockedByName.get(normalizedName) ?? 0) + hours,
    );
  }

  //************************************************************** */
  // RO Totals By Primary Technician

  for (const repairOrder of repairOrders) {
    const membership = repairOrder.primaryTechnician;

    if (!membership) {
      continue;
    }

    const totals = repairOrderTotals.get(repairOrder.id)!;

    const name = getPersonName(membership.user) ?? "Unnamed technician";

    const current = performance.get(membership.id) ?? {
      membershipId: membership.id,

      name,

      repairOrderCount: 0,

      billedHours: 0,

      clockedHours: 0,

      efficiency: null,

      laborRevenue: 0,

      totalRevenue: 0,

      averageTicket: 0,
    };

    current.repairOrderCount += 1;

    current.billedHours += totals.laborHours;

    current.laborRevenue += totals.laborRevenue;

    current.totalRevenue += totals.total;

    performance.set(membership.id, current);
  }

  //************************************************************** */
  // Attach Clocked Hours
  //
  // Membership ID is authoritative. Employee-name fallback keeps
  // historical/unlinked employee records useful.

  for (const item of performance.values()) {
    const membershipClockedHours = clockedByMembershipId.get(item.membershipId);

    const nameClockedHours = clockedByName.get(normalizeName(item.name));

    item.billedHours = roundHours(item.billedHours);

    item.clockedHours = roundHours(
      membershipClockedHours ?? nameClockedHours ?? 0,
    );

    item.laborRevenue = roundMoney(item.laborRevenue);

    item.totalRevenue = roundMoney(item.totalRevenue);

    item.efficiency =
      item.clockedHours > 0
        ? roundMoney((item.billedHours / item.clockedHours) * 100)
        : null;

    item.averageTicket =
      item.repairOrderCount > 0
        ? roundMoney(item.totalRevenue / item.repairOrderCount)
        : 0;
  }

  return Array.from(performance.values()).sort(
    (left, right) => right.totalRevenue - left.totalRevenue,
  );
}

//************************************************************** */
// Top Customers

function buildTopCustomers(
  repairOrders: ReportRepairOrder[],
  repairOrderTotals: Map<string, ReturnType<typeof calculateRepairOrderTotals>>,
): ReportTopCustomer[] {
  const customers = new Map<string, ReportTopCustomer>();

  for (const repairOrder of repairOrders) {
    const current = customers.get(repairOrder.customerId) ?? {
      customerId: repairOrder.customerId,

      name: getCustomerName(repairOrder.customer),

      repairOrderCount: 0,

      revenue: 0,
    };

    current.repairOrderCount += 1;

    current.revenue += repairOrderTotals.get(repairOrder.id)?.total ?? 0;

    customers.set(repairOrder.customerId, current);
  }

  return Array.from(customers.values())
    .map((customer) => ({
      ...customer,

      revenue: roundMoney(customer.revenue),
    }))
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 5);
}

//************************************************************** */
// Top Parts

function buildTopParts(repairOrders: ReportRepairOrder[]): ReportTopPart[] {
  const parts = new Map<string, ReportTopPart>();

  for (const repairOrder of repairOrders) {
    for (const line of repairOrder.partLines) {
      if (line.status === "CANCELLED") {
        continue;
      }

      const key = line.partId ?? `${line.partNumber}:${line.description}`;

      const quantity = decimalToNumber(line.quantity);

      const current = parts.get(key) ?? {
        partId: line.partId,

        partNumber: line.partNumber,

        description: line.description,

        quantity: 0,

        revenue: 0,
      };

      current.quantity += quantity;

      current.revenue += quantity * decimalToNumber(line.unitPrice);

      parts.set(key, current);
    }
  }

  return Array.from(parts.values())
    .map((part) => ({
      ...part,

      quantity: Math.round(part.quantity * 1000) / 1000,

      revenue: roundMoney(part.revenue),
    }))
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 5);
}

//************************************************************** */
// Technician / Advisor Filter Lists

function createMembershipFilterOptions(
  repairOrders: ReportRepairOrder[],
  type: "technician" | "advisor",
): ReportFilterOption[] {
  const values = new Map<string, string>();

  for (const repairOrder of repairOrders) {
    const membership =
      type === "technician"
        ? repairOrder.primaryTechnician
        : repairOrder.serviceAdvisor;

    if (!membership) {
      continue;
    }

    const name = getPersonName(membership.user);

    if (name) {
      values.set(membership.id, name);
    }
  }

  return Array.from(values.entries())
    .map(([id, name]) => ({
      id,

      name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

//************************************************************** */
// Available Years

function buildReportYears(
  sources: Awaited<ReturnType<typeof findReportYearSources>>,
): number[] {
  const years = new Set<number>([new Date().getFullYear()]);

  for (const repairOrder of sources.repairOrders) {
    years.add(repairOrder.createdAt.getFullYear());

    if (repairOrder.cashieredDate) {
      years.add(repairOrder.cashieredDate.getFullYear());
    }

    if (repairOrder.pickupDate) {
      years.add(repairOrder.pickupDate.getFullYear());
    }
  }

  for (const sale of sources.sales) {
    years.add(sale.createdAt.getFullYear());
  }

  for (const entry of sources.timeEntries) {
    years.add(entry.clockInAt.getFullYear());
  }

  return Array.from(years).sort((left, right) => right - left);
}

//************************************************************** */

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

//************************************************************** */
