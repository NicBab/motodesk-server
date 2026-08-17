import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPurchaseOrderFixture } from "./helpers/purchase-order-fixture.js";

//************************************************************** */

describe("Purchase Order ordering integration", () => {
  it("orders a purchase order and synchronizes on-order inventory and linked repair order part lines", async () => {
    const fixture = await createPurchaseOrderFixture({
      orderedQty: 2,
      qtyOnHand: 0,
      withRepairOrderPartLine: true,
    });

    const {
      agent,
      organizationId,
      purchaseOrderId,
      partId,
      repairOrderId,
      repairOrderPartLineId,
    } = fixture;

    if (!repairOrderId || !repairOrderPartLineId) {
      throw new Error("Repair order fixture was not created.");
    }

    //************************************************************** */
    // Order PO

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    assert.equal(orderResponse.body.data.status, "ORDERED");

    assert.notEqual(orderResponse.body.data.orderedAt, null);

    //************************************************************** */
    // Verify Part qtyOnOrder

    const partResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partId}`,
    );

    assert.equal(partResponse.status, 200);

    assert.equal(Number(partResponse.body.data.qtyOnOrder), 2);

    //************************************************************** */
    // Verify inventory ledger

    const transactionsResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/transactions`,
    );

    assert.equal(transactionsResponse.status, 200);

    const orderedTransaction = transactionsResponse.body.data.find(
      (transaction: {
        type: string;
        referenceType: string | null;
        referenceId: string | null;
      }) =>
        transaction.type === "PURCHASE_ORDERED" &&
        transaction.referenceType === "PURCHASE_ORDER" &&
        transaction.referenceId === purchaseOrderId,
    );

    assert.notEqual(orderedTransaction, undefined);

    //************************************************************** */
    // Verify linked RO part line

    const roPartLineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
    );

    assert.equal(roPartLineResponse.status, 200);

    assert.equal(roPartLineResponse.body.data.status, "ORDERED");

    assert.equal(Number(roPartLineResponse.body.data.orderedQty), 2);

    //************************************************************** */
    // Reject duplicate order

    const secondOrderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(secondOrderResponse.status, 400);

    assert.equal(secondOrderResponse.body.code, "PURCHASE_ORDER_NOT_DRAFT");

    //************************************************************** */
    // Verify qtyOnOrder was not double-counted

    const finalPartResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partId}`,
    );

    assert.equal(Number(finalPartResponse.body.data.qtyOnOrder), 2);
  });
});
