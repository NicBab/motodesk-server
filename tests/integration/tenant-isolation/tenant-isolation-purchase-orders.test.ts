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

describe("Purchase Order tenant isolation integration", () => {
  it("prevents cross-organization PO access and foreign vendor, part, and RO-demand references", async () => {
    const { agent, organizationId: organizationAId } =
      await createAuthenticatedAgent();

    const suffix = createSafeSuffix();

    //************************************************************** */
    // Organization B

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `PO Tenant B ${suffix}`,
        slug: `po-tenant-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId = organizationBResponse.body.data.id;

    await switchOrganization(agent, organizationBId);

    //************************************************************** */
    // Vendor B

    const vendorBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/vendors`)
      .send({
        name: `PO Foreign Vendor ${suffix}`,
      });

    assert.equal(vendorBResponse.status, 201);

    const vendorBId = vendorBResponse.body.data.id;

    //************************************************************** */
    // Part B

    const partNumberB = `PO-TENANT-B-${suffix}`;

    const partBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/parts`)
      .send({
        partNumber: partNumberB,
        description: "Organization B protected PO part",
        qtyOnHand: 0,
        costPrice: 10,
        sellPrice: 20,
      });

    assert.equal(partBResponse.status, 201);

    const partBId = partBResponse.body.data.id;

    //************************************************************** */
    // Customer / Vehicle / RO B

    const customerBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Foreign",
        lastName: `PO-Customer-${suffix}`,
      });

    assert.equal(customerBResponse.status, 201);

    const customerBId = customerBResponse.body.data.id;

    const vehicleBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/vehicles`)
      .send({
        customerId: customerBId,
        make: "Honda",
        model: "CRF450R",
        vin: `PO-TENANT-VIN-B-${suffix}`,
        type: "MOTORCYCLE",
      });

    assert.equal(vehicleBResponse.status, 201);

    const vehicleBId = vehicleBResponse.body.data.id;

    const repairOrderBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/repair-orders`)
      .send({
        customerId: customerBId,
        vehicleId: vehicleBId,
        complaint: "Organization B protected PO demand.",
      });

    assert.equal(repairOrderBResponse.status, 201);

    const repairOrderBId = repairOrderBResponse.body.data.id;

    //************************************************************** */
    // RO Part Line B

    const roPartLineBResponse = await agent
      .post(
        `/api/v1/organizations/${organizationBId}/repair-orders/${repairOrderBId}/part-lines`,
      )
      .send({
        partId: partBId,
        partNumber: partNumberB,
        description: "Organization B protected RO demand line",
        quantity: 2,
        requiredQty: 2,
        approvedQty: 2,
        unitPrice: 20,
        resolutionMethod: "ORIGINAL_PO",
      });

    assert.equal(roPartLineBResponse.status, 201);

    const roPartLineBId = roPartLineBResponse.body.data.id;

    const toBeOrderedBResponse = await agent
      .post(
        `/api/v1/organizations/${organizationBId}/repair-orders/${repairOrderBId}/part-lines/${roPartLineBId}/to-be-ordered`,
      )
      .send({});

    assert.equal(toBeOrderedBResponse.status, 200);

    //************************************************************** */
    // Purchase Order B

    const purchaseOrderBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/purchase-orders`)
      .send({
        vendorId: vendorBId,

        lines: [
          {
            partId: partBId,
            repairOrderPartLineId: roPartLineBId,
            orderedQty: 2,
            unitCost: 10,
          },
        ],
      });

    assert.equal(purchaseOrderBResponse.status, 201);

    const purchaseOrderBId = purchaseOrderBResponse.body.data.id;

    const purchaseOrderLineBId = purchaseOrderBResponse.body.data.lines[0].id;

    //************************************************************** */
    // Organization A fixtures

    await switchOrganization(agent, organizationAId);

    const vendorAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/vendors`)
      .send({
        name: `PO Local Vendor ${suffix}`,
      });

    assert.equal(vendorAResponse.status, 201);

    const vendorAId = vendorAResponse.body.data.id;

    const partNumberA = `PO-TENANT-A-${suffix}`;

    const partAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/parts`)
      .send({
        partNumber: partNumberA,
        description: "Organization A protected PO part",
        qtyOnHand: 0,
        costPrice: 15,
        sellPrice: 30,
      });

    assert.equal(partAResponse.status, 201);

    const partAId = partAResponse.body.data.id;

    //************************************************************** */
    // Local PO A

    const purchaseOrderAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/purchase-orders`)
      .send({
        vendorId: vendorAId,

        lines: [
          {
            partId: partAId,
            orderedQty: 1,
            unitCost: 15,
          },
        ],
      });

    assert.equal(purchaseOrderAResponse.status, 201);

    const purchaseOrderAId = purchaseOrderAResponse.body.data.id;

    //************************************************************** */
    // FOREIGN PO READ

    const foreignReadResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/purchase-orders/${purchaseOrderBId}`,
    );

    assert.equal(foreignReadResponse.status, 404);

    assert.equal(foreignReadResponse.body.code, "PURCHASE_ORDER_NOT_FOUND");

    //************************************************************** */
    // FOREIGN PO UPDATE

    const foreignUpdateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/purchase-orders/${purchaseOrderBId}`,
      )
      .send({
        notes: "CROSS TENANT PO MUTATION",
      });

    assert.equal(foreignUpdateResponse.status, 404);

    assert.equal(foreignUpdateResponse.body.code, "PURCHASE_ORDER_NOT_FOUND");

    //************************************************************** */
    // FOREIGN PO ORDER ACTION

    const foreignOrderResponse = await agent.post(
      `/api/v1/organizations/${organizationAId}/purchase-orders/${purchaseOrderBId}/order`,
    );

    assert.equal(foreignOrderResponse.status, 404);

    assert.equal(foreignOrderResponse.body.code, "PURCHASE_ORDER_NOT_FOUND");

    //************************************************************** */
    // FOREIGN PO CANCEL ACTION

    const foreignCancelResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/purchase-orders/${purchaseOrderBId}/cancel`,
      )
      .send({
        reason: "CROSS TENANT CANCEL ATTEMPT",
      });

    assert.equal(foreignCancelResponse.status, 404);

    assert.equal(foreignCancelResponse.body.code, "PURCHASE_ORDER_NOT_FOUND");

    //************************************************************** */
    // LIST ISOLATION

    const listResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/purchase-orders`,
    );

    assert.equal(listResponse.status, 200);

    assert.equal(
      listResponse.body.data.some(
        (purchaseOrder: { id: string }) =>
          purchaseOrder.id === purchaseOrderBId,
      ),
      false,
    );

    //************************************************************** */
    // FOREIGN VENDOR INJECTION — CREATE
    //
    // Valid Part A + Vendor B.

    const foreignVendorCreateResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/purchase-orders`)
      .send({
        vendorId: vendorBId,

        lines: [
          {
            partId: partAId,
            orderedQty: 1,
            unitCost: 15,
          },
        ],
      });

    assert.equal(foreignVendorCreateResponse.status, 400);

    assert.equal(
      foreignVendorCreateResponse.body.code,
      "PURCHASE_ORDER_VENDOR_INVALID",
    );

    //************************************************************** */
    // FOREIGN PART INJECTION — CREATE
    //
    // Valid Vendor A + Part B.

    const foreignPartCreateResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/purchase-orders`)
      .send({
        vendorId: vendorAId,

        lines: [
          {
            partId: partBId,
            orderedQty: 1,
            unitCost: 10,
          },
        ],
      });

    assert.equal(foreignPartCreateResponse.status, 400);

    assert.equal(
      foreignPartCreateResponse.body.code,
      "PURCHASE_ORDER_PART_INVALID",
    );

    //************************************************************** */
    // FOREIGN RO PART-LINE INJECTION — CREATE
    //
    // This uses a manual line intentionally so the request does not
    // fail on Part B before reaching the foreign RO demand check.

    const foreignDemandCreateResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/purchase-orders`)
      .send({
        vendorId: vendorAId,

        lines: [
          {
            repairOrderPartLineId: roPartLineBId,

            partNumber: `MANUAL-${suffix}`,

            description: "Cross-tenant RO demand injection",

            orderedQty: 1,
            unitCost: 10,
          },
        ],
      });

    assert.equal(foreignDemandCreateResponse.status, 400);

    assert.equal(
      foreignDemandCreateResponse.body.code,
      "PURCHASE_ORDER_REPAIR_ORDER_PART_LINE_INVALID",
    );

    //************************************************************** */
    // FOREIGN VENDOR INJECTION — UPDATE LOCAL PO

    const foreignVendorUpdateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/purchase-orders/${purchaseOrderAId}`,
      )
      .send({
        vendorId: vendorBId,
      });

    assert.equal(foreignVendorUpdateResponse.status, 400);

    assert.equal(
      foreignVendorUpdateResponse.body.code,
      "PURCHASE_ORDER_VENDOR_INVALID",
    );

    //************************************************************** */
    // FOREIGN PART INJECTION — UPDATE LOCAL PO

    const foreignPartUpdateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/purchase-orders/${purchaseOrderAId}`,
      )
      .send({
        lines: [
          {
            partId: partBId,
            orderedQty: 1,
            unitCost: 10,
          },
        ],
      });

    assert.equal(foreignPartUpdateResponse.status, 400);

    assert.equal(
      foreignPartUpdateResponse.body.code,
      "PURCHASE_ORDER_PART_INVALID",
    );

    //************************************************************** */
    // DATABASE INVARIANTS — PO B

    const storedPurchaseOrderB = await prisma.purchaseOrder.findUniqueOrThrow({
      where: {
        id: purchaseOrderBId,
      },

      include: {
        lines: true,
      },
    });

    assert.equal(storedPurchaseOrderB.organizationId, organizationBId);

    assert.equal(storedPurchaseOrderB.vendorId, vendorBId);

    assert.equal(storedPurchaseOrderB.status, "DRAFT");

    assert.equal(storedPurchaseOrderB.notes, null);

    assert.equal(storedPurchaseOrderB.lines.length, 1);

    assert.equal(storedPurchaseOrderB.lines[0].id, purchaseOrderLineBId);

    assert.equal(storedPurchaseOrderB.lines[0].partId, partBId);

    assert.equal(
      storedPurchaseOrderB.lines[0].repairOrderPartLineId,
      roPartLineBId,
    );

    assert.equal(Number(storedPurchaseOrderB.lines[0].receivedQty), 0);

    //************************************************************** */
    // DATABASE INVARIANTS — PO A
    //
    // Failed update attempts must not replace Vendor A or Part A.

    const storedPurchaseOrderA = await prisma.purchaseOrder.findUniqueOrThrow({
      where: {
        id: purchaseOrderAId,
      },

      include: {
        lines: true,
      },
    });

    assert.equal(storedPurchaseOrderA.organizationId, organizationAId);

    assert.equal(storedPurchaseOrderA.vendorId, vendorAId);

    assert.equal(storedPurchaseOrderA.lines.length, 1);

    assert.equal(storedPurchaseOrderA.lines[0].partId, partAId);

    //************************************************************** */
    // No Organization A PO may reference Vendor B.

    const crossTenantVendorReference = await prisma.purchaseOrder.findFirst({
      where: {
        organizationId: organizationAId,
        vendorId: vendorBId,
      },
    });

    assert.equal(crossTenantVendorReference, null);

    //************************************************************** */
    // No Organization A PO line may reference Part B.

    const crossTenantPartReference = await prisma.purchaseOrderLine.findFirst({
      where: {
        purchaseOrder: {
          organizationId: organizationAId,
        },

        partId: partBId,
      },
    });

    assert.equal(crossTenantPartReference, null);

    //************************************************************** */
    // No Organization A PO line may reference Organization B's
    // repair-order demand line.

    const crossTenantDemandReference = await prisma.purchaseOrderLine.findFirst(
      {
        where: {
          purchaseOrder: {
            organizationId: organizationAId,
          },

          repairOrderPartLineId: roPartLineBId,
        },
      },
    );

    assert.equal(crossTenantDemandReference, null);
  });
});
