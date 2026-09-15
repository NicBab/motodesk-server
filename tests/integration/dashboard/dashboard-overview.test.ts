import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Dashboard overview integration", () => {
  it("returns live operational dashboard data", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = randomUUID();

    //************************************************************** */
    // Capture organization baseline because integration tests use
    // the shared development organization.

    const baselineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/dashboard`,
    );

    assert.equal(baselineResponse.status, 200);

    const baseline = baselineResponse.body;

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Dashboard",

        lastName: `Customer-${suffix}`,
      });

    assert.equal(customerResponse.status, 201);

    const customer = customerResponse.body.data;

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId: customer.id,

        year: 2026,

        make: "Yamaha",

        model: "YZ250F",

        vin: `DASH-${suffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicle = vehicleResponse.body.data;

    //************************************************************** */
    // Open Repair Order

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId: customer.id,

        vehicleId: vehicle.id,

        complaint: "Dashboard integration repair order.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrder = repairOrderResponse.body.data;

    //************************************************************** */
    // Waiting on Parts workflow state

    await prisma.repairOrder.update({
      where: {
        id: repairOrder.id,
      },

      data: {
        status: "WAITING_ON_PARTS",
      },
    });

    //************************************************************** */
    // TO_BE_ORDERED demand

    await prisma.repairOrderPartLine.create({
      data: {
        repairOrderId: repairOrder.id,

        partNumber: `DASH-DEMAND-${suffix}`,

        description: "Dashboard order-demand part",

        quantity: 1,

        requiredQty: 1,

        approvedQty: 1,

        unitPrice: 25,

        status: "TO_BE_ORDERED",

        blocksWork: true,
      },
    });

    //************************************************************** */
    // BACKORDERED demand

    await prisma.repairOrderPartLine.create({
      data: {
        repairOrderId: repairOrder.id,

        partNumber: `DASH-BACKORDER-${suffix}`,

        description: "Dashboard backordered part",

        quantity: 1,

        requiredQty: 1,

        approvedQty: 1,

        unitPrice: 30,

        status: "BACKORDERED",

        blocksWork: true,
      },
    });

    //************************************************************** */
    // Low-stock inventory

    await prisma.part.create({
      data: {
        organizationId,

        partNumber: `DASH-LOW-${suffix}`,

        description: "Dashboard low-stock part",

        qtyOnHand: 1,

        qtyAllocated: 0,

        qtyOnOrder: 0,

        reorderPoint: 5,

        costPrice: 10,

        sellPrice: 20,

        location: "DASH-A1",
      },
    });

    //************************************************************** */
    // Inventory part used for POS

    const salePartResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `DASH-SALE-${suffix}`,

        description: "Dashboard POS part",

        qtyOnHand: 10,

        reorderPoint: 0,

        costPrice: 5,

        sellPrice: 20,

        location: "DASH-POS",
      });

    assert.equal(salePartResponse.status, 201);

    const salePart = salePartResponse.body.data;

    //************************************************************** */
    // $40 POS sale

    const saleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/sales`)
      .send({
        taxRate: 0,

        lines: [
          {
            partId: salePart.id,

            quantity: 2,
          },
        ],

        payments: [
          {
            method: "CASH",

            amount: 40,
          },
        ],
      });

    assert.equal(saleResponse.status, 201);

    assert.equal(saleResponse.body.success, true);

    const sale = saleResponse.body.data;

    //************************************************************** */
    // Refund one unit = $20

    const refundResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/sales/${sale.id}/returns`)
      .send({
        reason: "WRONG_PART",

        disposition: "RETURN_TO_INVENTORY",

        lines: [
          {
            originalSaleLineId: sale.lines[0].id,

            quantity: 1,
          },
        ],

        payments: [
          {
            method: "CASH",

            amount: 20,
          },
        ],
      });

    assert.equal(refundResponse.status, 201);

    assert.equal(refundResponse.body.success, true);

    //************************************************************** */
    // Dashboard

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/dashboard`,
    );

    assert.equal(response.status, 200);

    const dashboard = response.body;

    //************************************************************** */
    // Summary

    assert.ok(
      dashboard.summary.openRepairOrders >=
        baseline.summary.openRepairOrders + 1,
    );

    assert.ok(
      dashboard.summary.vehiclesInShop >= baseline.summary.vehiclesInShop,
    );

    assert.ok(
      dashboard.summary.lowStockAlerts >= baseline.summary.lowStockAlerts + 1,
    );

    //************************************************************** */
    // Workflow

    assert.ok(
      dashboard.workflow.waitingOnParts >= baseline.workflow.waitingOnParts + 1,
    );

    //************************************************************** */
    // Parts Demand

    assert.ok(
      dashboard.partsDemand.toBeOrdered >= baseline.partsDemand.toBeOrdered + 1,
    );

    assert.ok(
      dashboard.partsDemand.backordered >= baseline.partsDemand.backordered + 1,
    );

    //************************************************************** */
    // Sales MTD

    assert.ok(
      dashboard.salesMtd.grossSales >= baseline.salesMtd.grossSales + 40,
    );

    assert.ok(
      dashboard.salesMtd.returnsTotal >= baseline.salesMtd.returnsTotal + 20,
    );

    assert.ok(dashboard.salesMtd.saleCount >= baseline.salesMtd.saleCount + 1);

    assert.equal(
      dashboard.salesMtd.netSales,
      dashboard.salesMtd.grossSales - dashboard.salesMtd.returnsTotal,
    );

    //************************************************************** */
    // Recent Activity
    //
    // Recent activity is intentionally capped, but the RO was just
    // updated immediately before the dashboard request and should
    // therefore be present.

    const activityRow = dashboard.recentActivity.find(
      (activity: { id: string }) => activity.id === repairOrder.id,
    );

    assert.ok(activityRow);

    assert.equal(activityRow.roNumber, repairOrder.roNumber);

    assert.equal(activityRow.status, "WAITING_ON_PARTS");

    assert.equal(activityRow.vehicleDescription, "2026 Yamaha YZ250F");

    //************************************************************** */
    // Preview collections

    assert.ok(Array.isArray(dashboard.lowStockParts));

    assert.ok(dashboard.lowStockParts.length <= 10);

    assert.ok(Array.isArray(dashboard.expectedDeliveries));
  });
});

//************************************************************** */
