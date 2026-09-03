import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { prisma } from "../../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../../helpers/authenticated-agent.js";

//************************************************************** */

export async function createReportFixture() {
  const { agent, organizationId, membershipId } =
    await createAuthenticatedAgent();

  const suffix = randomUUID();

  //************************************************************** */
  // Isolated reporting window
  //
  // Each fixture uses its own organization, but an isolated future
  // period also keeps report assertions deterministic against any
  // pre-existing development data.

  const minuteSeed =
    parseInt(suffix.replaceAll("-", "").slice(0, 6), 16) % (300 * 24 * 60);

  const periodStart = new Date(Date.UTC(2098, 0, 1, 0, minuteSeed, 0, 0));

  const recordDate = new Date(periodStart.getTime() + 10_000);

  const periodEnd = new Date(periodStart.getTime() + 60_000);

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",

      firstName: "Reports",

      lastName: `Customer-${suffix}`,
    });

  assert.equal(customerResponse.status, 201);

  assert.equal(customerResponse.body.success, true);

  const customer = customerResponse.body.data;

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId: customer.id,

      make: "Honda",

      model: "CBR1000RR",

      year: 2026,

      vin: `REPORT-${suffix}`,

      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  assert.equal(vehicleResponse.body.success, true);

  const vehicle = vehicleResponse.body.data;

  //************************************************************** */
  // Repair Order

  const repairOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/repair-orders`)
    .send({
      customerId: customer.id,

      vehicleId: vehicle.id,

      complaint: "Reports integration repair order.",
    });

  assert.equal(repairOrderResponse.status, 201);

  assert.equal(repairOrderResponse.body.success, true);

  const repairOrder = repairOrderResponse.body.data;

  //************************************************************** */
  // Financial fixture
  //
  // Labor:
  // 2.0 hours x $100 = $200
  //
  // Parts:
  // 2 x $25 = $50
  //
  // Labor + Parts = $250
  //
  // Production RepairOrder default:
  // Shop Supplies = 6%
  // $250 x .06 = $15
  //
  // Subtotal = $265
  //
  // Discount = $10
  //
  // Taxable = $255
  //
  // Tax = 10%
  // $255 x .10 = $25.50
  //
  // RO Total = $280.50

  await prisma.repairOrder.update({
    where: {
      id: repairOrder.id,
    },

    data: {
      createdAt: recordDate,

      taxRate: 10,

      discount: 10,

      shopSuppliesRate: 6,
    },
  });

  //************************************************************** */
  // Labor

  await prisma.repairOrderLaborLine.create({
    data: {
      repairOrderId: repairOrder.id,

      description: "Reports labor",

      hours: 2,

      rate: 100,

      status: "ACTIVE",
    },
  });

  //************************************************************** */
  // RO Part

  await prisma.repairOrderPartLine.create({
    data: {
      repairOrderId: repairOrder.id,

      partNumber: `REPORT-PART-${suffix}`,

      description: "Reports test part",

      quantity: 2,

      unitPrice: 25,

      requiredQty: 2,

      approvedQty: 2,

      status: "AVAILABLE",

      blocksWork: false,
    },
  });

  //************************************************************** */

  return {
    agent,

    organizationId,

    membershipId,

    suffix,

    customer,

    vehicle,

    repairOrder,

    periodStart,

    recordDate,

    periodEnd,
  };
}

//************************************************************** */

export async function createReportPosSale(
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
) {
  //************************************************************** */
  // Inventory Part

  const partResponse = await fixture.agent
    .post(`/api/v1/organizations/${fixture.organizationId}/parts`)
    .send({
      partNumber: `REPORT-POS-${fixture.suffix}`,

      description: "Reports POS part",

      qtyOnHand: 10,

      reorderPoint: 2,

      costPrice: 5,

      sellPrice: 20,

      location: "REPORT-POS",
    });

  assert.equal(partResponse.status, 201);

  const part = partResponse.body.data;

  //************************************************************** */
  // POS Sale
  //
  // 2 x $20 = $40

  const saleResponse = await fixture.agent
    .post(`/api/v1/organizations/${fixture.organizationId}/sales`)
    .send({
      taxRate: 0,

      lines: [
        {
          partId: part.id,

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

  assert.equal(sale.type, "POS");

  assert.equal(Number(sale.total), 40);

  //************************************************************** */
  // Put sale inside isolated report period.

  await prisma.sale.update({
    where: {
      id: sale.id,
    },

    data: {
      createdAt: fixture.recordDate,
    },
  });

  //************************************************************** */
  // Refund one of the two items.
  //
  // Refund total = $20

  const refundResponse = await fixture.agent
    .post(
      `/api/v1/organizations/${fixture.organizationId}/sales/${sale.id}/returns`,
    )
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

  const refund = refundResponse.body.data;

  assert.equal(refund.type, "REFUND");

  assert.equal(Number(refund.total), 20);

  //************************************************************** */
  // Put refund inside isolated report period.

  await prisma.sale.update({
    where: {
      id: refund.id,
    },

    data: {
      createdAt: new Date(fixture.recordDate.getTime() + 1_000),
    },
  });

  return {
    part,

    sale,

    refund,
  };
}

//************************************************************** */

export async function getFixtureReport(
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
) {
  return fixture.agent
    .get(`/api/v1/organizations/${fixture.organizationId}/reports/overview`)
    .query({
      start: fixture.periodStart.toISOString(),

      end: fixture.periodEnd.toISOString(),

      mode: "month",
    });
}

//************************************************************** */
