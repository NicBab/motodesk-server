import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

function createSafeSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

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

async function createPurchasingFixture(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
) {
  //************************************************************** */
  // Vendor

  const vendorResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vendors`)
    .send({
      name: `${label} Receiving Vendor ${suffix}`,
    });

  assert.equal(vendorResponse.status, 201);

  const vendorId = vendorResponse.body.data.id;

  //************************************************************** */
  // Inventory part

  const partNumber = `${label}-RECEIVING-${suffix}`;

  const partResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/parts`)
    .send({
      partNumber,
      description: `${label} receiving protected inventory part`,
      qtyOnHand: 0,
      costPrice: 10,
      sellPrice: 20,
    });

  assert.equal(partResponse.status, 201);

  const partId = partResponse.body.data.id;

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",
      firstName: label,
      lastName: `Receiving-${suffix}`,
    });

  assert.equal(customerResponse.status, 201);

  const customerId = customerResponse.body.data.id;

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId,
      make: "Honda",
      model: "CRF450R",
      vin: `${label}-RECEIVING-VIN-${suffix}`,
      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  const vehicleId = vehicleResponse.body.data.id;

  //************************************************************** */
  // Repair Order

  const repairOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/repair-orders`)
    .send({
      customerId,
      vehicleId,
      complaint: `${label} protected receiving repair order.`,
    });

  assert.equal(repairOrderResponse.status, 201);

  const repairOrderId = repairOrderResponse.body.data.id;

  //************************************************************** */
  // RO part demand

  const repairOrderPartLineResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
    )
    .send({
      partId,
      partNumber,
      description: `${label} protected receiving RO part line`,
      quantity: 2,
      requiredQty: 2,
      approvedQty: 2,
      unitPrice: 20,
      resolutionMethod: "ORIGINAL_PO",
    });

  assert.equal(repairOrderPartLineResponse.status, 201);

  const repairOrderPartLineId = repairOrderPartLineResponse.body.data.id;

  const toBeOrderedResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}/to-be-ordered`,
    )
    .send({});

  assert.equal(toBeOrderedResponse.status, 200);

  //************************************************************** */
  // Purchase Order

  const purchaseOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
    .send({
      vendorId,

      lines: [
        {
          partId,

          repairOrderPartLineId,

          orderedQty: 2,

          unitCost: 10,
        },
      ],
    });

  assert.equal(purchaseOrderResponse.status, 201);

  const purchaseOrderId = purchaseOrderResponse.body.data.id;

  const purchaseOrderLineId = purchaseOrderResponse.body.data.lines[0].id;

  //************************************************************** */
  // PO must be ORDERED before receiving.

  const orderResponse = await agent.post(
    `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
  );

  assert.equal(orderResponse.status, 200);

  assert.equal(orderResponse.body.data.status, "ORDERED");

  //************************************************************** */

  return {
    vendorId,

    partId,
    partNumber,

    customerId,
    vehicleId,

    repairOrderId,
    repairOrderPartLineId,

    purchaseOrderId,
    purchaseOrderLineId,
  };
}

//************************************************************** */

describe("Purchase Order receiving tenant isolation integration", () => {
  it("prevents foreign PO-line receipt injection without inventory, RO-demand, or receipt side effects", async () => {
    const { agent, organizationId: organizationAId } =
      await createAuthenticatedAgent();

    const suffix = createSafeSuffix();

    //************************************************************** */
    // Create Organization B.

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `PO Receiving Tenant B ${suffix}`,

        slug: `po-receiving-tenant-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId = organizationBResponse.body.data.id;

    //************************************************************** */
    // Organization B purchasing fixture.

    await switchOrganization(agent, organizationBId);

    const fixtureB = await createPurchasingFixture(
      agent,
      organizationBId,
      suffix,
      "B",
    );

    //************************************************************** */
    // Organization A purchasing fixture.

    await switchOrganization(agent, organizationAId);

    const fixtureA = await createPurchasingFixture(
      agent,
      organizationAId,
      suffix,
      "A",
    );

    //************************************************************** */
    // Capture initial database state.

    const initialPartA = await prisma.part.findUniqueOrThrow({
      where: {
        id: fixtureA.partId,
      },
    });

    const initialPartB = await prisma.part.findUniqueOrThrow({
      where: {
        id: fixtureB.partId,
      },
    });

    const initialPoLineA = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: {
        id: fixtureA.purchaseOrderLineId,
      },
    });

    const initialPoLineB = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: {
        id: fixtureB.purchaseOrderLineId,
      },
    });

    const initialRoPartA = await prisma.repairOrderPartLine.findUniqueOrThrow({
      where: {
        id: fixtureA.repairOrderPartLineId,
      },
    });

    const initialRoPartB = await prisma.repairOrderPartLine.findUniqueOrThrow({
      where: {
        id: fixtureB.repairOrderPartLineId,
      },
    });

    const initialReceiptCountA = await prisma.purchaseOrderReceipt.count({
      where: {
        organizationId: organizationAId,
      },
    });

    const initialReceiptCountB = await prisma.purchaseOrderReceipt.count({
      where: {
        organizationId: organizationBId,
      },
    });

    //************************************************************** */
    // FOREIGN PO RECEIPT
    //
    // Organization A cannot receive Organization B's PO even when
    // supplying the correct Organization B PO-line ID.

    const foreignPurchaseOrderResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/purchase-orders/${fixtureB.purchaseOrderId}/receive`,
      )
      .send({
        lines: [
          {
            purchaseOrderLineId: fixtureB.purchaseOrderLineId,

            quantity: 1,
          },
        ],
      });

    assert.equal(foreignPurchaseOrderResponse.status, 404);

    assert.equal(
      foreignPurchaseOrderResponse.body.code,
      "PURCHASE_ORDER_NOT_FOUND",
    );

    //************************************************************** */
    // FOREIGN LINE INJECTION INTO VALID ORGANIZATION A PO
    //
    // The PO itself belongs to A, but the submitted line ID belongs
    // to B.

    const foreignLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/purchase-orders/${fixtureA.purchaseOrderId}/receive`,
      )
      .send({
        invoiceNumber: "CROSS-TENANT-FOREIGN-LINE",

        lines: [
          {
            purchaseOrderLineId: fixtureB.purchaseOrderLineId,

            quantity: 1,

            notes: "Foreign PO-line injection attempt.",
          },
        ],
      });

    assert.equal(foreignLineResponse.status, 400);

    assert.equal(
      foreignLineResponse.body.code,
      "PURCHASE_ORDER_LINE_NOT_FOUND",
    );

    //************************************************************** */
    // MIXED VALID + FOREIGN RECEIPT
    //
    // This is the critical atomicity test.
    //
    // The first line is a completely valid Organization A receipt
    // line. The second belongs to Organization B.
    //
    // The entire receipt must fail before the valid A line changes
    // inventory, RO demand, PO quantities, or creates receipt history.

    const mixedReceiptResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/purchase-orders/${fixtureA.purchaseOrderId}/receive`,
      )
      .send({
        invoiceNumber: "CROSS-TENANT-MIXED-RECEIPT",

        packingSlip: "SECURITY-TEST",

        notes: "Receipt must remain atomic.",

        lines: [
          {
            purchaseOrderLineId: fixtureA.purchaseOrderLineId,

            quantity: 1,

            actualCost: 10,

            binLocation: "A-1",
          },

          {
            purchaseOrderLineId: fixtureB.purchaseOrderLineId,

            quantity: 1,
          },
        ],
      });

    assert.equal(mixedReceiptResponse.status, 400);

    assert.equal(
      mixedReceiptResponse.body.code,
      "PURCHASE_ORDER_LINE_NOT_FOUND",
    );

    //************************************************************** */
    // DATABASE INVARIANT — Organization A inventory unchanged.

    const storedPartA = await prisma.part.findUniqueOrThrow({
      where: {
        id: fixtureA.partId,
      },
    });

    assert.equal(storedPartA.organizationId, organizationAId);

    assert.equal(Number(storedPartA.qtyOnHand), Number(initialPartA.qtyOnHand));

    assert.equal(
      Number(storedPartA.qtyOnOrder),
      Number(initialPartA.qtyOnOrder),
    );

    //************************************************************** */
    // DATABASE INVARIANT — Organization B inventory unchanged.

    const storedPartB = await prisma.part.findUniqueOrThrow({
      where: {
        id: fixtureB.partId,
      },
    });

    assert.equal(storedPartB.organizationId, organizationBId);

    assert.equal(Number(storedPartB.qtyOnHand), Number(initialPartB.qtyOnHand));

    assert.equal(
      Number(storedPartB.qtyOnOrder),
      Number(initialPartB.qtyOnOrder),
    );

    //************************************************************** */
    // DATABASE INVARIANT — PO line A unchanged.

    const storedPoLineA = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: {
        id: fixtureA.purchaseOrderLineId,
      },
    });

    assert.equal(storedPoLineA.purchaseOrderId, fixtureA.purchaseOrderId);

    assert.equal(
      Number(storedPoLineA.receivedQty),
      Number(initialPoLineA.receivedQty),
    );

    assert.equal(
      Number(storedPoLineA.damagedQty),
      Number(initialPoLineA.damagedQty),
    );

    assert.equal(
      Number(storedPoLineA.backorderedQty),
      Number(initialPoLineA.backorderedQty),
    );

    //************************************************************** */
    // DATABASE INVARIANT — PO line B unchanged.

    const storedPoLineB = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: {
        id: fixtureB.purchaseOrderLineId,
      },
    });

    assert.equal(storedPoLineB.purchaseOrderId, fixtureB.purchaseOrderId);

    assert.equal(
      Number(storedPoLineB.receivedQty),
      Number(initialPoLineB.receivedQty),
    );

    assert.equal(
      Number(storedPoLineB.damagedQty),
      Number(initialPoLineB.damagedQty),
    );

    assert.equal(
      Number(storedPoLineB.backorderedQty),
      Number(initialPoLineB.backorderedQty),
    );

    //************************************************************** */
    // DATABASE INVARIANT — RO demand A unchanged.

    const storedRoPartA = await prisma.repairOrderPartLine.findUniqueOrThrow({
      where: {
        id: fixtureA.repairOrderPartLineId,
      },
    });

    assert.equal(storedRoPartA.repairOrderId, fixtureA.repairOrderId);

    assert.equal(
      Number(storedRoPartA.receivedQty),
      Number(initialRoPartA.receivedQty),
    );

    assert.equal(storedRoPartA.status, initialRoPartA.status);

    //************************************************************** */
    // DATABASE INVARIANT — RO demand B unchanged.

    const storedRoPartB = await prisma.repairOrderPartLine.findUniqueOrThrow({
      where: {
        id: fixtureB.repairOrderPartLineId,
      },
    });

    assert.equal(storedRoPartB.repairOrderId, fixtureB.repairOrderId);

    assert.equal(
      Number(storedRoPartB.receivedQty),
      Number(initialRoPartB.receivedQty),
    );

    assert.equal(storedRoPartB.status, initialRoPartB.status);

    //************************************************************** */
    // No receipt header may have been created by either rejected
    // Organization A request.

    const finalReceiptCountA = await prisma.purchaseOrderReceipt.count({
      where: {
        organizationId: organizationAId,
      },
    });

    assert.equal(finalReceiptCountA, initialReceiptCountA);

    //************************************************************** */
    // Organization B receipt history must also remain untouched.

    const finalReceiptCountB = await prisma.purchaseOrderReceipt.count({
      where: {
        organizationId: organizationBId,
      },
    });

    assert.equal(finalReceiptCountB, initialReceiptCountB);

    //************************************************************** */
    // PO statuses must remain ORDERED.

    const storedPurchaseOrderA = await prisma.purchaseOrder.findUniqueOrThrow({
      where: {
        id: fixtureA.purchaseOrderId,
      },
    });

    assert.equal(storedPurchaseOrderA.status, "ORDERED");

    const storedPurchaseOrderB = await prisma.purchaseOrder.findUniqueOrThrow({
      where: {
        id: fixtureB.purchaseOrderId,
      },
    });

    assert.equal(storedPurchaseOrderB.status, "ORDERED");
  });
});
