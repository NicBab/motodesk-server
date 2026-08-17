import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "./helpers/authenticated-agent.js";

//************************************************************** */

describe("Purchase Order integration", () => {
  it("creates, retrieves, searches, updates, and allocates sequential PO numbers", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    //************************************************************** */
    // Create vendor

    const vendorResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vendors`)
      .send({
        name: `PO Vendor ${uniqueSuffix}`,
      });

    assert.equal(vendorResponse.status, 201);

    const vendorId = vendorResponse.body.data.id;

    //************************************************************** */
    // Create part

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `PO-PART-${uniqueSuffix}`,
        description: "Purchase order test part",
        qtyOnHand: 0,
        costPrice: 10,
        sellPrice: 20,
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

    //************************************************************** */
    // Create first PO

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .send({
        vendorId,
        vendorReference: `VREF-${uniqueSuffix}`,
        shippingCost: 15,
        taxAmount: 5,
        notes: "Purchase order integration test.",
        lines: [
          {
            partId,
            orderedQty: 3,
            unitCost: 10,
          },
        ],
      });

    assert.equal(createResponse.status, 201);

    assert.equal(createResponse.body.success, true);

    const purchaseOrderId = createResponse.body.data.id;

    const firstPoNumber = createResponse.body.data.poNumber;

    assert.equal(typeof purchaseOrderId, "string");

    assert.equal(typeof firstPoNumber, "number");

    assert.equal(createResponse.body.data.status, "DRAFT");

    assert.equal(createResponse.body.data.vendorId, vendorId);

    assert.equal(createResponse.body.data.lines.length, 1);

    assert.equal(createResponse.body.data.lines[0].partId, partId);

    assert.equal(
      createResponse.body.data.lines[0].partNumber,
      `PO-PART-${uniqueSuffix}`,
    );

    assert.equal(
      createResponse.body.data.lines[0].description,
      "Purchase order test part",
    );

    assert.equal(Number(createResponse.body.data.lines[0].orderedQty), 3);

    //************************************************************** */
    // Get PO

    const getResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
    );

    assert.equal(getResponse.status, 200);

    assert.equal(getResponse.body.data.id, purchaseOrderId);

    //************************************************************** */
    // Search/list PO

    const listResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .query({
        search: `PO-PART-${uniqueSuffix}`,
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
    // Update draft PO

    const updateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
      )
      .send({
        vendorReference: `UPDATED-${uniqueSuffix}`,
        shippingCost: 20,
        taxAmount: 7,
        notes: "Updated PO integration test.",
      });

    assert.equal(updateResponse.status, 200);

    assert.equal(
      updateResponse.body.data.vendorReference,
      `UPDATED-${uniqueSuffix}`,
    );

    assert.equal(Number(updateResponse.body.data.shippingCost), 20);

    assert.equal(Number(updateResponse.body.data.taxAmount), 7);

    //************************************************************** */
    // Create second PO to verify sequence

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

    assert.equal(secondResponse.body.data.poNumber, firstPoNumber + 1);
  });
});

it("orders a purchase order and synchronizes on-order inventory and linked repair order part lines", async () => {
  const { agent, organizationId } = await createAuthenticatedAgent();

  const uniqueSuffix = `${Date.now()}-ordered`;

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",
      firstName: "PO",
      lastName: "Customer",
    });

  assert.equal(customerResponse.status, 201);

  const customerId = customerResponse.body.data.id;

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId,
      make: "Kawasaki",
      model: "KX250",
      vin: `PO-ORDER-VIN-${uniqueSuffix}`,
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
      complaint: "Replace clutch components.",
    });

  assert.equal(repairOrderResponse.status, 201);

  const repairOrderId = repairOrderResponse.body.data.id;

  //************************************************************** */
  // Part

  const partNumber = `PO-ORDER-PART-${uniqueSuffix}`;

  const partResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/parts`)
    .send({
      partNumber,
      description: "Ordered clutch component",
      qtyOnHand: 0,
      costPrice: 25,
      sellPrice: 45,
    });

  assert.equal(partResponse.status, 201);

  const partId = partResponse.body.data.id;

  //************************************************************** */
  // RO part line

  const roPartLineResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
    )
    .send({
      partId,
      partNumber,
      description: "Ordered clutch component",
      quantity: 2,
      requiredQty: 2,
      approvedQty: 2,
      unitPrice: 45,
      resolutionMethod: "ORIGINAL_PO",
    });

  assert.equal(roPartLineResponse.status, 201);

  const repairOrderPartLineId = roPartLineResponse.body.data.id;

  //************************************************************** */
  // Mark TO_BE_ORDERED

  const toBeOrderedResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}/to-be-ordered`,
    )
    .send({});

  assert.equal(toBeOrderedResponse.status, 200);

  assert.equal(toBeOrderedResponse.body.data.status, "TO_BE_ORDERED");

  //************************************************************** */
  // Vendor

  const vendorResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vendors`)
    .send({
      name: `Order Vendor ${uniqueSuffix}`,
    });

  assert.equal(vendorResponse.status, 201);

  const vendorId = vendorResponse.body.data.id;

  //************************************************************** */
  // Draft PO linked to RO part line

  const poResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
    .send({
      vendorId,
      lines: [
        {
          partId,
          repairOrderPartLineId,
          orderedQty: 2,
          unitCost: 25,
        },
      ],
    });

  assert.equal(poResponse.status, 201);

  const purchaseOrderId = poResponse.body.data.id;

  assert.equal(poResponse.body.data.status, "DRAFT");

  //************************************************************** */
  // Order PO

  const orderResponse = await agent.post(
    `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
  );

  assert.equal(orderResponse.status, 200);

  assert.equal(orderResponse.body.data.status, "ORDERED");

  assert.notEqual(orderResponse.body.data.orderedAt, null);

  //************************************************************** */
  // Verify Part.qtyOnOrder

  const partAfterOrder = await agent.get(
    `/api/v1/organizations/${organizationId}/parts/${partId}`,
  );

  assert.equal(partAfterOrder.status, 200);

  assert.equal(Number(partAfterOrder.body.data.qtyOnOrder), 2);

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

  const roPartLineAfterOrder = await agent.get(
    `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
  );

  assert.equal(roPartLineAfterOrder.status, 200);

  assert.equal(roPartLineAfterOrder.body.data.status, "ORDERED");

  assert.equal(Number(roPartLineAfterOrder.body.data.orderedQty), 2);

  //************************************************************** */
  // Reject duplicate order transition

  const secondOrderResponse = await agent.post(
    `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
  );

  assert.equal(secondOrderResponse.status, 400);

  assert.equal(secondOrderResponse.body.code, "PURCHASE_ORDER_NOT_DRAFT");

  //************************************************************** */
  // Verify qtyOnOrder was not incremented twice

  const finalPartResponse = await agent.get(
    `/api/v1/organizations/${organizationId}/parts/${partId}`,
  );

  assert.equal(Number(finalPartResponse.body.data.qtyOnOrder), 2);

  //************************************************************** */
  // Get PO line ID

  const orderedPurchaseOrderResponse = await agent.get(
    `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
  );

  assert.equal(orderedPurchaseOrderResponse.status, 200);

  const purchaseOrderLineId =
    orderedPurchaseOrderResponse.body.data.lines[0].id;

  //************************************************************** */
  // Receive 1 of 2

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
  // Verify Part balances after partial receipt

  const partAfterPartialReceipt = await agent.get(
    `/api/v1/organizations/${organizationId}/parts/${partId}`,
  );

  assert.equal(Number(partAfterPartialReceipt.body.data.qtyOnHand), 1);

  assert.equal(Number(partAfterPartialReceipt.body.data.qtyOnOrder), 1);

  //************************************************************** */
  // Verify linked RO part line after partial receipt

  const roPartLineAfterPartialReceipt = await agent.get(
    `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
  );

  assert.equal(
    roPartLineAfterPartialReceipt.body.data.status,
    "PARTIALLY_RECEIVED",
  );

  assert.equal(Number(roPartLineAfterPartialReceipt.body.data.receivedQty), 1);

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

  assert.equal(Number(finalReceiveResponse.body.data.lines[0].receivedQty), 2);

  //************************************************************** */
  // Verify final Part balances

  const partAfterFinalReceipt = await agent.get(
    `/api/v1/organizations/${organizationId}/parts/${partId}`,
  );

  assert.equal(Number(partAfterFinalReceipt.body.data.qtyOnHand), 2);

  assert.equal(Number(partAfterFinalReceipt.body.data.qtyOnOrder), 0);

  //************************************************************** */
  // Verify linked RO part line is fully received

  const roPartLineAfterFinalReceipt = await agent.get(
    `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
  );

  assert.equal(roPartLineAfterFinalReceipt.body.data.status, "RECEIVED");

  assert.equal(Number(roPartLineAfterFinalReceipt.body.data.receivedQty), 2);

  //************************************************************** */
  // Verify PURCHASE_RECEIPT ledger entries

  const receiptTransactionsResponse = await agent.get(
    `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/transactions`,
  );

  const receiptTransactions = receiptTransactionsResponse.body.data.filter(
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

it("cancels the outstanding remainder of a partially received purchase order", async () => {
  const { agent, organizationId } = await createAuthenticatedAgent();

  const uniqueSuffix = `${Date.now()}-cancel`;

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",
      firstName: "Cancel",
      lastName: "Customer",
    });

  assert.equal(customerResponse.status, 201);

  const customerId = customerResponse.body.data.id;

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId,
      make: "Yamaha",
      model: "YZ450F",
      vin: `PO-CANCEL-VIN-${uniqueSuffix}`,
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
      complaint: "Replace transmission component.",
    });

  assert.equal(repairOrderResponse.status, 201);

  const repairOrderId = repairOrderResponse.body.data.id;

  //************************************************************** */
  // Part

  const partNumber = `PO-CANCEL-PART-${uniqueSuffix}`;

  const partResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/parts`)
    .send({
      partNumber,
      description: "Cancellation test part",
      qtyOnHand: 0,
      costPrice: 20,
      sellPrice: 40,
    });

  assert.equal(partResponse.status, 201);

  const partId = partResponse.body.data.id;

  //************************************************************** */
  // RO part line

  const roPartLineResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
    )
    .send({
      partId,
      partNumber,
      description: "Cancellation test part",
      quantity: 5,
      requiredQty: 5,
      approvedQty: 5,
      unitPrice: 40,
      resolutionMethod: "ORIGINAL_PO",
    });

  assert.equal(roPartLineResponse.status, 201);

  const repairOrderPartLineId = roPartLineResponse.body.data.id;

  //************************************************************** */
  // Mark TO_BE_ORDERED

  const toBeOrderedResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}/to-be-ordered`,
    )
    .send({});

  assert.equal(toBeOrderedResponse.status, 200);

  //************************************************************** */
  // Vendor

  const vendorResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vendors`)
    .send({
      name: `Cancel Vendor ${uniqueSuffix}`,
    });

  assert.equal(vendorResponse.status, 201);

  const vendorId = vendorResponse.body.data.id;

  //************************************************************** */
  // Draft PO

  const poResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
    .send({
      vendorId,
      lines: [
        {
          partId,
          repairOrderPartLineId,
          orderedQty: 5,
          unitCost: 20,
        },
      ],
    });

  assert.equal(poResponse.status, 201);

  const purchaseOrderId = poResponse.body.data.id;

  const purchaseOrderLineId = poResponse.body.data.lines[0].id;

  //************************************************************** */
  // Order PO

  const orderResponse = await agent.post(
    `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
  );

  assert.equal(orderResponse.status, 200);

  //************************************************************** */
  // Receive 2 of 5

  const receiveResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
    )
    .send({
      purchaseOrderLineId,
      quantity: 2,
    });

  assert.equal(receiveResponse.status, 200);

  assert.equal(receiveResponse.body.data.status, "PARTIALLY_RECEIVED");

  //************************************************************** */
  // Verify pre-cancel balances

  const partBeforeCancel = await agent.get(
    `/api/v1/organizations/${organizationId}/parts/${partId}`,
  );

  assert.equal(Number(partBeforeCancel.body.data.qtyOnHand), 2);

  assert.equal(Number(partBeforeCancel.body.data.qtyOnOrder), 3);

  //************************************************************** */
  // Cancel remaining 3

  const cancelResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/cancel`,
    )
    .send({
      notes: "Vendor cannot supply remaining quantity.",
    });

  assert.equal(cancelResponse.status, 200);

  assert.equal(cancelResponse.body.data.status, "CANCELLED");

  //************************************************************** */
  // Received inventory stays; on-order remainder clears

  const partAfterCancel = await agent.get(
    `/api/v1/organizations/${organizationId}/parts/${partId}`,
  );

  assert.equal(Number(partAfterCancel.body.data.qtyOnHand), 2);

  assert.equal(Number(partAfterCancel.body.data.qtyOnOrder), 0);

  //************************************************************** */
  // RO line keeps received quantity but returns to unresolved state

  const roPartLineAfterCancel = await agent.get(
    `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
  );

  assert.equal(Number(roPartLineAfterCancel.body.data.receivedQty), 2);

  assert.equal(Number(roPartLineAfterCancel.body.data.orderedQty), 2);

  assert.equal(roPartLineAfterCancel.body.data.status, "BACKORDERED");

  //************************************************************** */
  // Verify cancellation ledger

  const transactionsResponse = await agent.get(
    `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/transactions`,
  );

  const cancellationTransaction = transactionsResponse.body.data.find(
    (transaction: {
      type: string;
      referenceType: string | null;
      referenceId: string | null;
    }) =>
      transaction.type === "PURCHASE_CANCELLED" &&
      transaction.referenceType === "PURCHASE_ORDER" &&
      transaction.referenceId === purchaseOrderId,
  );

  assert.notEqual(cancellationTransaction, undefined);

  assert.equal(Number(cancellationTransaction.quantity), 3);

  //************************************************************** */
  // Reject second cancellation

  const secondCancelResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/cancel`,
    )
    .send({});

  assert.equal(secondCancelResponse.status, 400);

  assert.equal(
    secondCancelResponse.body.code,
    "PURCHASE_ORDER_NOT_CANCELLABLE",
  );
});
