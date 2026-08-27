import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

import { createPurchaseOrderFixture } from "./helpers/purchase-order-fixture.js";

//************************************************************** */

describe("Purchase Order receiving integration", () => {
  it("partially and fully receives inventory-backed PO lines with receiving metadata and releases the linked repair order after staging", async () => {
    const fixture = await createPurchaseOrderFixture({
      orderedQty: 3,
      qtyOnHand: 0,

      withRepairOrderPartLine: true,
    });

    const {
      agent,
      organizationId,
      purchaseOrderId,
      purchaseOrderLineId,
      partId,
      repairOrderId,
      repairOrderPartLineId,
    } = fixture;

    if (!repairOrderId || !repairOrderPartLineId) {
      throw new Error("Repair order fixture was not created.");
    }

    //************************************************************** */
    // Move RO through approval to waiting on parts

    const requestApprovalResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
      )
      .send({
        notes: "Estimate ready for approval.",
      });

    assert.equal(requestApprovalResponse.status, 200);

    const approvalResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
      )
      .send({
        approvalMethod: "PHONE",

        approvedBy: "Receiving Test Customer",
      });

    assert.equal(approvalResponse.status, 200);

    assert.equal(approvalResponse.body.data.status, "PARTS_REVIEW");

    const partsReviewResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
      )
      .send({
        notes: "Required part must be ordered.",
      });

    assert.equal(partsReviewResponse.status, 200);

    assert.equal(partsReviewResponse.body.data.status, "WAITING_ON_PARTS");

    //************************************************************** */
    // Order PO

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    assert.equal(orderResponse.body.data.status, "ORDERED");

    //************************************************************** */
    // Partial receipt

    const partialResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId,

        quantity: 1,

        damagedQty: 1,

        backorderedQty: 1,

        actualCost: 11.25,

        invoiceNumber: "INV-10001",

        packingSlip: "PACK-10001",

        binLocation: "A-14",

        notes: "First shipment.",
      });

    assert.equal(partialResponse.status, 200);

    assert.equal(partialResponse.body.data.status, "PARTIALLY_RECEIVED");

    const partialLine = partialResponse.body.data.lines[0];

    assert.equal(Number(partialLine.receivedQty), 1);

    assert.equal(Number(partialLine.damagedQty), 1);

    assert.equal(Number(partialLine.backorderedQty), 1);

    assert.equal(Number(partialLine.actualCost), 11.25);

    assert.equal(partialLine.invoiceNumber, "INV-10001");

    assert.equal(partialLine.packingSlip, "PACK-10001");

    assert.equal(partialLine.binLocation, "A-14");

    //************************************************************** */
    // Inventory after partial receipt

    const partAfterPartial = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partId}`,
    );

    assert.equal(Number(partAfterPartial.body.data.qtyOnHand), 1);

    assert.equal(Number(partAfterPartial.body.data.qtyOnOrder), 2);

    //************************************************************** */
    // Linked RO part after partial receipt

    const roPartAfterPartial = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
    );

    assert.equal(roPartAfterPartial.body.data.status, "PARTIALLY_RECEIVED");

    assert.equal(Number(roPartAfterPartial.body.data.receivedQty), 1);

    //************************************************************** */
    // Reject over-receipt

    const excessiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId,

        quantity: 3,
      });

    assert.equal(excessiveResponse.status, 400);

    assert.equal(
      excessiveResponse.body.code,
      "PURCHASE_ORDER_RECEIPT_EXCEEDS_REMAINING",
    );

    //************************************************************** */
    // Final receipt

    const finalResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId,

        quantity: 2,

        actualCost: 10.75,

        invoiceNumber: "INV-10001",

        packingSlip: "PACK-10002",

        binLocation: "A-14",

        notes: "Final shipment.",
      });

    assert.equal(finalResponse.status, 200);

    assert.equal(finalResponse.body.data.status, "RECEIVED");

    assert.notEqual(finalResponse.body.data.receivedAt, null);

    const finalLine = finalResponse.body.data.lines[0];

    assert.equal(Number(finalLine.receivedQty), 3);

    assert.equal(Number(finalLine.damagedQty), 1);

    assert.equal(Number(finalLine.backorderedQty), 1);

    assert.equal(Number(finalLine.actualCost), 10.75);

    //************************************************************** */
    // Final inventory

    const finalPart = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partId}`,
    );

    assert.equal(Number(finalPart.body.data.qtyOnHand), 3);

    assert.equal(Number(finalPart.body.data.qtyOnOrder), 0);

    //************************************************************** */
    // Linked RO line fully received

    const finalRoPart = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
    );

    assert.equal(finalRoPart.body.data.status, "RECEIVED");

    assert.equal(Number(finalRoPart.body.data.receivedQty), 3);

    //************************************************************** */
    // RO still waits until physical part is staged

    const roBeforeStage = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(roBeforeStage.body.data.status, "WAITING_ON_PARTS");

    const stageResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}/stage`,
      )
      .send({
        notes: "Received part staged.",
      });

    assert.equal(stageResponse.status, 200);

    assert.equal(stageResponse.body.data.status, "STAGED");

    const roAfterStage = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(roAfterStage.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Inventory ledger

    const transactionsResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/transactions`,
    );

    const receiptTransactions = transactionsResponse.body.data.filter(
      (transaction: {
        type: string;

        referenceType: string | null;

        referenceId: string | null;
      }) =>
        transaction.type === "PURCHASE_RECEIPT" &&
        transaction.referenceType === "PURCHASE_ORDER" &&
        transaction.referenceId === purchaseOrderId,
    );

    assert.equal(receiptTransactions.length, 2);
  });

  //************************************************************** */

  it("receives a manual vendor-only PO line without changing inventory", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const unique = Date.now().toString();

    //************************************************************** */
    // Vendor

    const vendorResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vendors`)
      .send({
        name: `Manual Receiving Vendor ${unique}`,
      });

    assert.equal(vendorResponse.status, 201);

    const vendorId = vendorResponse.body.data.id;

    //************************************************************** */
    // Manual PO

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .send({
        vendorId,

        lines: [
          {
            partNumber: `SPECIAL-${unique}`,

            description: "Special vendor-only component",

            orderedQty: 2,

            unitCost: 22.5,
          },
        ],
      });

    assert.equal(createResponse.status, 201);

    const purchaseOrderId = createResponse.body.data.id;

    const line = createResponse.body.data.lines[0];

    assert.equal(line.partId, null);

    //************************************************************** */
    // Order

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    //************************************************************** */
    // Receive manual line

    const receiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId: line.id,

        quantity: 2,

        actualCost: 21.95,

        invoiceNumber: "MANUAL-INV-1",

        packingSlip: "MANUAL-PACK-1",

        binLocation: "SPECIAL-ORDER",

        notes: "Manual vendor part received.",
      });

    assert.equal(receiveResponse.status, 200);

    assert.equal(receiveResponse.body.data.status, "RECEIVED");

    const receivedLine = receiveResponse.body.data.lines[0];

    assert.equal(receivedLine.partId, null);

    assert.equal(Number(receivedLine.receivedQty), 2);

    assert.equal(Number(receivedLine.actualCost), 21.95);

    assert.equal(receivedLine.invoiceNumber, "MANUAL-INV-1");

    assert.equal(receivedLine.packingSlip, "MANUAL-PACK-1");

    assert.equal(receivedLine.binLocation, "SPECIAL-ORDER");
  });
});
