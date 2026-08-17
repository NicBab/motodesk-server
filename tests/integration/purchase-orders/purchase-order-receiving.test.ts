import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPurchaseOrderFixture } from "./helpers/purchase-order-fixture.js";

//************************************************************** */

describe("Purchase Order receiving integration", () => {
  it("partially and fully receives a purchase order and releases the repair order when all blocking parts are received", async () => {
    const fixture = await createPurchaseOrderFixture({
      orderedQty: 2,
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
    // Move RO to WAITING_ON_PARTS

    const waitingResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
      )
      .send({
        status: "WAITING_ON_PARTS",

        notes: "Waiting for ordered parts.",

        automatic: false,
      });

    assert.equal(waitingResponse.status, 200);

    assert.equal(waitingResponse.body.data.status, "WAITING_ON_PARTS");

    //************************************************************** */
    // Order PO

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    assert.equal(orderResponse.body.data.status, "ORDERED");

    //************************************************************** */
    // Partial receive 1 of 2

    const partialReceiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId,

        quantity: 1,

        notes: "Partial shipment received.",
      });

    assert.equal(partialReceiveResponse.status, 200);

    assert.equal(partialReceiveResponse.body.data.status, "PARTIALLY_RECEIVED");

    assert.equal(
      Number(partialReceiveResponse.body.data.lines[0].receivedQty),
      1,
    );

    //************************************************************** */
    // Inventory balances after partial receipt

    const partAfterPartialReceipt = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partId}`,
    );

    assert.equal(Number(partAfterPartialReceipt.body.data.qtyOnHand), 1);

    assert.equal(Number(partAfterPartialReceipt.body.data.qtyOnOrder), 1);

    //************************************************************** */
    // Linked RO part line after partial receipt

    const roPartLineAfterPartial = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
    );

    assert.equal(roPartLineAfterPartial.body.data.status, "PARTIALLY_RECEIVED");

    assert.equal(Number(roPartLineAfterPartial.body.data.receivedQty), 1);

    //************************************************************** */
    // RO must remain waiting

    const roAfterPartial = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(roAfterPartial.body.data.status, "WAITING_ON_PARTS");

    //************************************************************** */
    // Reject over-receipt

    const excessiveReceiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId,

        quantity: 2,
      });

    assert.equal(excessiveReceiveResponse.status, 400);

    assert.equal(
      excessiveReceiveResponse.body.code,
      "PURCHASE_ORDER_RECEIPT_EXCEEDS_REMAINING",
    );

    //************************************************************** */
    // Receive final 1

    const finalReceiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId,

        quantity: 1,
      });

    assert.equal(finalReceiveResponse.status, 200);

    assert.equal(finalReceiveResponse.body.data.status, "RECEIVED");

    assert.notEqual(finalReceiveResponse.body.data.receivedAt, null);

    assert.equal(
      Number(finalReceiveResponse.body.data.lines[0].receivedQty),
      2,
    );

    //************************************************************** */
    // Final inventory balances

    const partAfterFinalReceipt = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partId}`,
    );

    assert.equal(Number(partAfterFinalReceipt.body.data.qtyOnHand), 2);

    assert.equal(Number(partAfterFinalReceipt.body.data.qtyOnOrder), 0);

    //************************************************************** */
    // RO part line fully received

    const roPartLineAfterFinal = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
    );

    assert.equal(roPartLineAfterFinal.body.data.status, "RECEIVED");

    assert.equal(Number(roPartLineAfterFinal.body.data.receivedQty), 2);

    //************************************************************** */
    // RO automatically becomes READY_TO_WORK

    const roAfterFinal = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(roAfterFinal.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Verify receipt ledger

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
});
