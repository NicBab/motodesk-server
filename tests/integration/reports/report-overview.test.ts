import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import {
  createReportFixture,
  createReportPosSale,
  getFixtureReport,
} from "./helpers/report.fixture.js";

//************************************************************** */

describe("Reports overview integration", () => {
  it("calculates RO financials, shop supplies, POS refunds, and combined revenue", async () => {
    const fixture = await createReportFixture();

    const { sale, refund } = await createReportPosSale(fixture);

    const response = await getFixtureReport(fixture);

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    const report = response.body.data;

    //************************************************************** */
    // Repair Order
    //
    // Labor              $200.00
    // Parts                50.00
    // Shop Supplies 6%     15.00
    // Subtotal            265.00
    // Discount            -10.00
    // Taxable             255.00
    // Tax 10%              25.50
    // Total               280.50

    assert.equal(report.summary.repairOrderCount, 1);

    assert.equal(report.summary.laborRevenue, 200);

    assert.equal(report.summary.partsRevenue, 50);

    assert.equal(report.summary.shopSuppliesRevenue, 15);

    assert.equal(report.summary.discountTotal, 10);

    assert.equal(report.summary.taxCollected, 25.5);

    assert.equal(report.summary.billedLaborHours, 2);

    assert.equal(report.summary.repairOrderRevenue, 280.5);

    assert.equal(report.summary.averageRepairOrderValue, 280.5);

    assert.equal(report.summary.averageLaborHoursPerRepairOrder, 2);

    //************************************************************** */
    // POS
    //
    // Gross POS = $40
    // Refund    = $20
    // Net POS   = $20

    assert.equal(report.summary.grossPosRevenue, 40);

    assert.equal(report.summary.posReturnTotal, 20);

    assert.equal(report.summary.netPosRevenue, 20);

    assert.equal(report.summary.posSaleCount, 1);

    assert.equal(report.summary.posReturnCount, 1);

    assert.equal(report.summary.posReturnRate, 50);

    //************************************************************** */
    // Combined Revenue
    //
    // RO $280.50
    // POS Net $20.00
    // Total $300.50

    assert.equal(report.summary.totalRevenue, 300.5);

    //************************************************************** */
    // Labor vs Parts chart source

    assert.equal(report.laborPartsBreakdown.laborRevenue, 200);

    assert.equal(report.laborPartsBreakdown.partsRevenue, 50);

    //************************************************************** */
    // Revenue Trend Must Reconcile

    const trendTotal = report.revenueTrend.reduce(
      (
        total: number,
        point: {
          totalRevenue: number;
        },
      ) => total + point.totalRevenue,
      0,
    );

    assert.equal(trendTotal, 300.5);

    //************************************************************** */
    // RO Status Distribution

    const statusRow = report.statusDistribution.find(
      (row: {
        status: string;

        count: number;
      }) => row.status === "ESTIMATE",
    );

    assert.ok(statusRow);

    assert.equal(statusRow.count, 1);

    //************************************************************** */
    // POS Transaction Log

    const saleRow = report.posTransactions.find(
      (row: { id: string }) => row.id === sale.id,
    );

    const refundRow = report.posTransactions.find(
      (row: { id: string }) => row.id === refund.id,
    );

    assert.ok(saleRow);

    assert.ok(refundRow);

    assert.equal(saleRow.type, "POS");

    assert.equal(saleRow.total, 40);

    assert.equal(refundRow.type, "REFUND");

    assert.equal(refundRow.total, 20);

    //************************************************************** */
    // RO Transaction Log

    const repairOrderRow = report.repairOrderTransactions.find(
      (row: { id: string }) => row.id === fixture.repairOrder.id,
    );

    assert.ok(repairOrderRow);

    assert.equal(repairOrderRow.laborHours, 2);

    assert.equal(repairOrderRow.laborRevenue, 200);

    assert.equal(repairOrderRow.partsRevenue, 50);

    assert.equal(repairOrderRow.shopSupplies, 15);

    assert.equal(repairOrderRow.discount, 10);

    assert.equal(repairOrderRow.tax, 25.5);

    assert.equal(repairOrderRow.total, 280.5);

    //************************************************************** */
    // Top Customer

    assert.equal(report.topCustomers.length, 1);

    assert.equal(report.topCustomers[0].customerId, fixture.customer.id);

    assert.equal(report.topCustomers[0].repairOrderCount, 1);

    assert.equal(report.topCustomers[0].revenue, 280.5);

    //************************************************************** */
    // Top RO Part

    const topPart = report.topParts.find(
      (part: { partNumber: string }) =>
        part.partNumber === `REPORT-PART-${fixture.suffix}`,
    );

    assert.ok(topPart);

    assert.equal(topPart.quantity, 2);

    assert.equal(topPart.revenue, 50);
  });

  //************************************************************** */

  it("reports employee clocked hours and shop efficiency", async () => {
    const fixture = await createReportFixture();

    //************************************************************** */
    // Technician

    const employeeResponse = await fixture.agent
      .post(`/api/v1/organizations/${fixture.organizationId}/employees`)
      .send({
        firstName: "Report",

        lastName: `Technician-${fixture.suffix}`,

        role: "TECHNICIAN",

        hourlyRate: 30,

        laborRate: 100,

        isSchedulable: true,

        dailyStartTime: "08:00",

        dailyEndTime: "17:00",

        maxDailyHours: 8,
      });

    assert.equal(employeeResponse.status, 201);

    assert.equal(employeeResponse.body.success, true);

    const employee = employeeResponse.body.data;

    //************************************************************** */
    // Four employee clocked hours.

    await prisma.employeeTimeEntry.create({
      data: {
        organizationId: fixture.organizationId,

        employeeId: employee.id,

        employeeName: `${employee.firstName} ${employee.lastName}`,

        clockInAt: fixture.recordDate,

        clockOutAt: new Date(fixture.recordDate.getTime() + 4 * 60 * 60 * 1000),

        breakMinutes: 0,

        workedMinutes: 240,

        status: "CLOCKED_OUT",

        source: "MANAGER_ENTRY",

        authMethod: "MANUAL",
      },
    });

    const response = await getFixtureReport(fixture);

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    const summary = response.body.data.summary;

    assert.equal(summary.billedLaborHours, 2);

    assert.equal(summary.employeeClockedHours, 4);

    //************************************************************** */
    // 2 billed hours / 4 employee hours = 50%

    assert.equal(summary.shopEfficiency, 50);
  });

  //************************************************************** */

  it("uses cashier and pickup event dates instead of RO creation date", async () => {
    const fixture = await createReportFixture();

    //************************************************************** */
    // Move RO creation outside the reporting window.
    //
    // Cashier and pickup events remain inside it.

    await prisma.repairOrder.update({
      where: {
        id: fixture.repairOrder.id,
      },

      data: {
        createdAt: new Date(
          fixture.periodStart.getTime() - 24 * 60 * 60 * 1000,
        ),

        status: "PICKED_UP",

        cashierStatus: "COMPLETED",

        cashieredDate: fixture.recordDate,

        pickupStatus: "COMPLETED",

        pickupDate: new Date(fixture.recordDate.getTime() + 1_000),

        pickupRecipient: "Report Customer",
      },
    });

    //************************************************************** */
    // Event actors

    await prisma.repairOrderStatusHistory.createMany({
      data: [
        {
          repairOrderId: fixture.repairOrder.id,

          previousStatus: "READY_FOR_PICKUP",

          status: "CASHIERED",

          changedByMembershipId: fixture.membershipId,

          changedAt: fixture.recordDate,

          automatic: false,
        },

        {
          repairOrderId: fixture.repairOrder.id,

          previousStatus: "CASHIERED",

          status: "PICKED_UP",

          changedByMembershipId: fixture.membershipId,

          changedAt: new Date(fixture.recordDate.getTime() + 1_000),

          automatic: false,
        },
      ],
    });

    const response = await getFixtureReport(fixture);

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    const report = response.body.data;

    //************************************************************** */
    // It is not an RO created during this report period.

    assert.equal(report.summary.repairOrderCount, 0);

    assert.equal(report.summary.repairOrderRevenue, 0);

    //************************************************************** */
    // But its operational events occurred during the period.

    assert.equal(report.summary.cashieredCount, 1);

    assert.equal(report.summary.pickedUpCount, 1);

    //************************************************************** */
    // Cashier Detail

    assert.equal(report.cashieredRepairOrders.length, 1);

    const cashiered = report.cashieredRepairOrders[0];

    assert.equal(cashiered.id, fixture.repairOrder.id);

    assert.equal(cashiered.cashierStatus, "COMPLETED");

    assert.ok(cashiered.cashierName);

    //************************************************************** */
    // Pickup Detail

    assert.equal(report.pickedUpRepairOrders.length, 1);

    const pickedUp = report.pickedUpRepairOrders[0];

    assert.equal(pickedUp.id, fixture.repairOrder.id);

    assert.equal(pickedUp.pickupStatus, "COMPLETED");

    assert.equal(pickedUp.pickupRecipient, "Report Customer");

    assert.ok(pickedUp.releasedBy);
  });

  //************************************************************** */

  it("keeps report data isolated to the requested organization", async () => {
    const first = await createReportFixture();

    const second = await createReportFixture();

    //************************************************************** */
    // Give second organization different financial values.

    await prisma.repairOrder.update({
      where: {
        id: second.repairOrder.id,
      },

      data: {
        discount: 0,

        taxRate: 0,

        shopSuppliesRate: 0,
      },
    });

    //************************************************************** */
    // First organization report

    const firstResponse = await getFixtureReport(first);

    assert.equal(firstResponse.status, 200);

    const firstReport = firstResponse.body.data;

    assert.equal(firstReport.summary.repairOrderCount, 1);

    assert.ok(
      firstReport.repairOrderTransactions.some(
        (row: { id: string }) => row.id === first.repairOrder.id,
      ),
    );

    assert.equal(
      firstReport.repairOrderTransactions.some(
        (row: { id: string }) => row.id === second.repairOrder.id,
      ),
      false,
    );

    assert.ok(
      firstReport.topCustomers.some(
        (row: { customerId: string }) => row.customerId === first.customer.id,
      ),
    );

    assert.equal(
      firstReport.topCustomers.some(
        (row: { customerId: string }) => row.customerId === second.customer.id,
      ),
      false,
    );
  });

  //************************************************************** */

  it("rejects an invalid reporting range", async () => {
    const fixture = await createReportFixture();

    const response = await fixture.agent
      .get(`/api/v1/organizations/${fixture.organizationId}/reports/overview`)
      .query({
        start: fixture.periodEnd.toISOString(),

        end: fixture.periodStart.toISOString(),

        mode: "month",
      });

    assert.equal(response.status, 400);

    assert.equal(response.body.success, false);
  });
});

//************************************************************** */
