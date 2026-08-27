import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createPurchaseOrderFixture } from "./helpers/purchase-order-fixture.js";

//************************************************************** */

describe("Purchase Order CRUD integration", () => {
  it("creates, retrieves, searches, updates, allocates sequential PO numbers, and supports manual PO lines", async () => {
    const first = await createPurchaseOrderFixture();

    const {
      agent,
      organizationId,
      vendorId,
      purchaseOrderId,
      partNumber,
      partId,
    } = first;

    //************************************************************** */
    // Retrieve first PO

    const firstPurchaseOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
    );

    assert.equal(firstPurchaseOrderResponse.status, 200);

    assert.equal(firstPurchaseOrderResponse.body.success, true);

    assert.equal(firstPurchaseOrderResponse.body.data.id, purchaseOrderId);

    assert.equal(firstPurchaseOrderResponse.body.data.status, "DRAFT");

    const firstPoNumber = firstPurchaseOrderResponse.body.data.poNumber;

    assert.equal(typeof firstPoNumber, "number");

    //************************************************************** */
    // Search

    const listResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .query({
        search: partNumber,

        status: "DRAFT",

        vendorId,

        isActive: "true",
      });

    assert.equal(listResponse.status, 200);

    assert.equal(listResponse.body.success, true);

    const found = listResponse.body.data.some(
      (purchaseOrder: { id: string }) => purchaseOrder.id === purchaseOrderId,
    );

    assert.equal(found, true);

    //************************************************************** */
    // Update draft

    const updateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
      )
      .send({
        vendorReference: "UPDATED-REFERENCE",

        shippingCost: 20,

        taxAmount: 7,

        notes: "Updated purchase order.",
      });

    assert.equal(updateResponse.status, 200);

    assert.equal(updateResponse.body.success, true);

    assert.equal(updateResponse.body.data.vendorReference, "UPDATED-REFERENCE");

    assert.equal(Number(updateResponse.body.data.shippingCost), 20);

    assert.equal(Number(updateResponse.body.data.taxAmount), 7);

    assert.equal(updateResponse.body.data.notes, "Updated purchase order.");

    //************************************************************** */
    // Create second normal PO
    //
    // This assertion must happen before any other PO is created in
    // this organization so the sequential-number test is stable.

    const secondResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .send({
        vendorId,

        lines: [
          {
            partId,

            orderedQty: 1,

            unitCost: 10,
          },
        ],
      });

    assert.equal(secondResponse.status, 201);

    assert.equal(secondResponse.body.success, true);

    assert.equal(secondResponse.body.data.poNumber, firstPoNumber + 1);

    assert.equal(secondResponse.body.data.status, "DRAFT");

    //************************************************************** */
    // Manual / vendor-only PO line
    //
    // This line intentionally has no inventory partId.

    const manualPartNumber = `MANUAL-${Date.now()}`;

    const manualDescription = "Special order vendor-only component";

    const manualPurchaseOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .send({
        vendorId,

        vendorReference: "MANUAL-LINE-TEST",

        lines: [
          {
            partNumber: manualPartNumber,

            description: manualDescription,

            orderedQty: 2,

            unitCost: 42.5,
          },
        ],
      });

    assert.equal(manualPurchaseOrderResponse.status, 201);

    assert.equal(manualPurchaseOrderResponse.body.success, true);

    const manualPurchaseOrder = manualPurchaseOrderResponse.body.data;

    assert.equal(manualPurchaseOrder.status, "DRAFT");

    assert.equal(manualPurchaseOrder.lines.length, 1);

    const manualLine = manualPurchaseOrder.lines[0];

    assert.equal(manualLine.partId, null);

    assert.equal(manualLine.partNumber, manualPartNumber);

    assert.equal(manualLine.description, manualDescription);

    assert.equal(Number(manualLine.orderedQty), 2);

    assert.equal(Number(manualLine.receivedQty), 0);

    assert.equal(Number(manualLine.unitCost), 42.5);

    assert.equal(manualLine.part, null);

    assert.equal(manualLine.repairOrderPartLine, null);

    //************************************************************** */
    // Retrieve manual PO

    const manualGetResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/purchase-orders/${manualPurchaseOrder.id}`,
    );

    assert.equal(manualGetResponse.status, 200);

    assert.equal(manualGetResponse.body.data.id, manualPurchaseOrder.id);

    assert.equal(manualGetResponse.body.data.lines[0].partId, null);

    assert.equal(
      manualGetResponse.body.data.lines[0].partNumber,
      manualPartNumber,
    );

    //************************************************************** */
    // Search manual line by part number

    const manualSearchResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .query({
        search: manualPartNumber,

        isActive: "true",
      });

    assert.equal(manualSearchResponse.status, 200);

    assert.equal(manualSearchResponse.body.success, true);

    const manualFound = manualSearchResponse.body.data.some(
      (purchaseOrder: { id: string }) =>
        purchaseOrder.id === manualPurchaseOrder.id,
    );

    assert.equal(manualFound, true);
  });
});
