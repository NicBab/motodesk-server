import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

async function switchOrganization(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
) {
  const response = await agent.post("/api/v1/auth/switch-organization").send({
    organizationId,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
}

//************************************************************** */

async function createOperationalFixture(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
) {
  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",

      firstName: label,

      lastName: `Report-Dashboard-${suffix}`,
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

      vin: `TENANT-REPORT-${label}-${suffix}`,

      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  const vehicle = vehicleResponse.body.data;

  //************************************************************** */
  // Repair Order

  const repairOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/repair-orders`)
    .send({
      customerId: customer.id,

      vehicleId: vehicle.id,

      complaint: `${label} protected reporting fixture ${suffix}.`,
    });

  assert.equal(repairOrderResponse.status, 201);

  const repairOrder = repairOrderResponse.body.data;

  //************************************************************** */
  // Put RO into a dashboard-visible workflow state.

  await prisma.repairOrder.update({
    where: {
      id: repairOrder.id,
    },

    data: {
      status: "WAITING_ON_PARTS",
    },
  });

  //************************************************************** */
  // Protected low-stock part.
  //
  // This gives Dashboard a directly identifiable B-only resource.

  const part = await prisma.part.create({
    data: {
      organizationId,

      partNumber: `TENANT-LOW-${label}-${suffix}`,

      description: `${label} protected low-stock part ${suffix}`,

      qtyOnHand: 1,

      qtyAllocated: 0,

      qtyOnOrder: 0,

      reorderPoint: 5,

      costPrice: 10,

      sellPrice: 20,

      location: `TENANT-${label}`,
    },
  });

  //************************************************************** */
  // Protected TO_BE_ORDERED demand.

  const demand = await prisma.repairOrderPartLine.create({
    data: {
      repairOrderId: repairOrder.id,

      partNumber: `TENANT-DEMAND-${label}-${suffix}`,

      description: `${label} protected demand ${suffix}`,

      quantity: 1,

      requiredQty: 1,

      approvedQty: 1,

      unitPrice: 25,

      status: "TO_BE_ORDERED",

      blocksWork: true,
    },
  });

  return {
    customer,
    vehicle,
    repairOrder,
    part,
    demand,
  };
}

//************************************************************** */

describe("Reports and Dashboard tenant isolation integration", () => {
  it("prevents another organization's operational and reporting data from leaking through aggregate read models", async () => {
    const {
      agent,

      organizationId: organizationAId,
    } = await createAuthenticatedAgent();

    const suffix = randomUUID();

    //************************************************************** */
    // ORGANIZATION B

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `Reporting Tenant B ${suffix}`,

        slug: `reporting-tenant-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId = organizationBResponse.body.data.id;

    //************************************************************** */
    // ORGANIZATION B PROTECTED DATA

    await switchOrganization(agent, organizationBId);

    const fixtureB = await createOperationalFixture(
      agent,
      organizationBId,
      suffix,
      "B",
    );

    //************************************************************** */
    // ORGANIZATION A LOCAL DATA
    //
    // A gets its own identifiable resources so successful responses
    // prove the endpoints work while remaining tenant scoped.

    await switchOrganization(agent, organizationAId);

    const fixtureA = await createOperationalFixture(
      agent,
      organizationAId,
      suffix,
      "A",
    );

    //************************************************************** */
    // DASHBOARD

    const dashboardResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/dashboard`,
    );

    assert.equal(dashboardResponse.status, 200);

    // assert.equal(
    //   dashboardResponse.body.success,
    //   true,
    // );

    const dashboard = dashboardResponse.body;

    //************************************************************** */
    // Recent RO activity must contain A's RO but never B's.

    assert.equal(
      dashboard.recentActivity.some(
        (row: { id: string }) => row.id === fixtureA.repairOrder.id,
      ),
      true,
    );

    assert.equal(
      dashboard.recentActivity.some(
        (row: { id: string }) => row.id === fixtureB.repairOrder.id,
      ),
      false,
    );

    //************************************************************** */
    // Low-stock resources must remain tenant scoped.

    assert.ok(Array.isArray(dashboard.lowStockParts));

    assert.ok(dashboard.lowStockParts.length <= 10);

    assert.equal(
      dashboard.lowStockParts.some(
        (row: { id: string }) => row.id === fixtureB.part.id,
      ),
      false,
    );

    //************************************************************** */
    // Serialize the read model as a second leakage guard.
    //
    // None of B's unique resource identifiers or unique protected
    // values may appear anywhere in A's dashboard payload.

    const dashboardJson = JSON.stringify(dashboard);

    assert.equal(dashboardJson.includes(fixtureB.repairOrder.id), false);

    assert.equal(dashboardJson.includes(fixtureB.customer.id), false);

    assert.equal(dashboardJson.includes(fixtureB.vehicle.id), false);

    assert.equal(dashboardJson.includes(fixtureB.part.id), false);

    assert.equal(dashboardJson.includes(fixtureB.part.partNumber), false);

    assert.equal(dashboardJson.includes(fixtureB.demand.partNumber), false);

    //************************************************************** */
    // REPORTS
    //
    // Wide range intentionally includes both fixtures.

    const reportResponse = await agent
      .get(`/api/v1/organizations/${organizationAId}/reports/overview`)
      .query({
        start: "2026-01-01T00:00:00.000Z",

        end: "2027-01-01T00:00:00.000Z",

        mode: "annual",
      });

    assert.equal(reportResponse.status, 200);

    assert.equal(reportResponse.body.success, true);

    const report = reportResponse.body.data;

    const reportJson = JSON.stringify(report);

    //************************************************************** */
    // Organization B identifiers must not appear anywhere in A's
    // report read model.

    assert.equal(reportJson.includes(fixtureB.repairOrder.id), false);

    assert.equal(reportJson.includes(fixtureB.customer.id), false);

    assert.equal(reportJson.includes(fixtureB.vehicle.id), false);

    assert.equal(reportJson.includes(fixtureB.part.id), false);

    assert.equal(reportJson.includes(fixtureB.part.partNumber), false);

    assert.equal(reportJson.includes(fixtureB.demand.partNumber), false);

    //************************************************************** */
    // Explicit report transaction guard.

    assert.equal(
      report.repairOrderTransactions.some(
        (row: { id: string }) => row.id === fixtureB.repairOrder.id,
      ),
      false,
    );

    //************************************************************** */
    // Explicit customer aggregation guard.

    assert.equal(
      report.topCustomers.some(
        (row: { customerId: string }) =>
          row.customerId === fixtureB.customer.id,
      ),
      false,
    );

    //************************************************************** */
    // DATABASE SANITY
    //
    // The protected resources really do belong to B. This prevents
    // a false-positive test caused by malformed fixture setup.

    const storedRepairOrderB = await prisma.repairOrder.findUniqueOrThrow({
      where: {
        id: fixtureB.repairOrder.id,
      },
    });

    assert.equal(storedRepairOrderB.organizationId, organizationBId);

    const storedPartB = await prisma.part.findUniqueOrThrow({
      where: {
        id: fixtureB.part.id,
      },
    });

    assert.equal(storedPartB.organizationId, organizationBId);

    //************************************************************** */
    // And A's fixture remains correctly scoped.

    const storedRepairOrderA = await prisma.repairOrder.findUniqueOrThrow({
      where: {
        id: fixtureA.repairOrder.id,
      },
    });

    assert.equal(storedRepairOrderA.organizationId, organizationAId);
  });
});

//************************************************************** */
