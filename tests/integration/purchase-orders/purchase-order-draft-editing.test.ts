import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createPurchaseOrderFixture } from "./helpers/purchase-order-fixture.js";

//************************************************************** */

describe("Purchase Order draft editing integration", () => {
  it("replaces draft lines atomically and preserves valid RO line linkage", async () => {
    const fixture = await createPurchaseOrderFixture({
      orderedQty: 2,
      withRepairOrderPartLine: true,
    });

    const {
      agent,
      organizationId,
      vendorId,
      purchaseOrderId,
      purchaseOrderLineId,
      partId,
      repairOrderPartLineId,
    } = fixture;

    assert.ok(repairOrderPartLineId);

    const manualPartNumber = `EDIT-MANUAL-${Date.now()}`;

    const updateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
      )
      .send({
        vendorId,
        vendorReference: "EDITED-DRAFT",
        shippingCost: 12.5,
        taxAmount: 3.25,
        notes: "Draft lines replaced by integration test.",
        lines: [
          {
            partId,
            repairOrderPartLineId,
            orderedQty: 4,
            unitCost: 11.5,
          },
          {
            partNumber: manualPartNumber,
            description: "Edited special-order manual part",
            orderedQty: 1,
            unitCost: 27,
          },
        ],
      });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.body.success, true);

    const purchaseOrder = updateResponse.body.data;

    assert.equal(purchaseOrder.status, "DRAFT");
    assert.equal(purchaseOrder.vendorReference, "EDITED-DRAFT");
    assert.equal(Number(purchaseOrder.shippingCost), 12.5);
    assert.equal(Number(purchaseOrder.taxAmount), 3.25);
    assert.equal(purchaseOrder.lines.length, 2);

    assert.equal(
      purchaseOrder.lines.some(
        (line: { id: string }) => line.id === purchaseOrderLineId,
      ),
      false,
    );

    const inventoryLine = purchaseOrder.lines.find(
      (line: { partId: string | null }) => line.partId === partId,
    );

    assert.ok(inventoryLine);
    assert.equal(inventoryLine.repairOrderPartLineId, repairOrderPartLineId);
    assert.equal(Number(inventoryLine.orderedQty), 4);
    assert.equal(Number(inventoryLine.receivedQty), 0);
    assert.equal(Number(inventoryLine.unitCost), 11.5);

    const manualLine = purchaseOrder.lines.find(
      (line: { partNumber: string }) => line.partNumber === manualPartNumber,
    );

    assert.ok(manualLine);
    assert.equal(manualLine.partId, null);
    assert.equal(manualLine.repairOrderPartLineId, null);
    assert.equal(manualLine.description, "Edited special-order manual part");
    assert.equal(Number(manualLine.orderedQty), 1);
    assert.equal(Number(manualLine.unitCost), 27);

    const orderResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
      )
      .send({});

    assert.equal(orderResponse.status, 200);
    assert.equal(orderResponse.body.data.status, "ORDERED");

    const rejectedEditResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
      )
      .send({
        notes: "This must not be accepted after ordering.",
        lines: [
          {
            partNumber: "INVALID-AFTER-ORDER",
            description: "Should never replace ordered PO lines",
            orderedQty: 1,
            unitCost: 1,
          },
        ],
      });

    assert.equal(rejectedEditResponse.status, 400);

    const finalResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
    );

    assert.equal(finalResponse.status, 200);
    assert.equal(finalResponse.body.data.status, "ORDERED");
    assert.equal(finalResponse.body.data.lines.length, 2);
    assert.equal(
      finalResponse.body.data.lines.some(
        (line: { partNumber: string }) => line.partNumber === "INVALID-AFTER-ORDER",
      ),
      false,
    );
  });
});

//************************************************************** */
