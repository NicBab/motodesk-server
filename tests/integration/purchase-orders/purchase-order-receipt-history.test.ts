import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Purchase Order receipt history integration", () => {
  it("creates one persistent receipt with multiple lines and releases the linked RO when all blocking parts are received", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const unique = Date.now().toString();

    //************************************************************** */
    // Vendor

    const vendorResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vendors`)
      .send({
        name: `Receipt History Vendor ${unique}`,
      });

    assert.equal(vendorResponse.status, 201);

    const vendorId = vendorResponse.body.data.id;

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Receipt",

        lastName: "History",
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

        model: "YZ250F",

        vin: `RECEIPT-HISTORY-${unique}`,

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

        complaint: "Receipt history integration test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Inventory parts

    const partOneResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `RECEIPT-A-${unique}`,

        description: "Receipt history part A",

        qtyOnHand: 0,

        costPrice: 10,

        sellPrice: 20,
      });

    assert.equal(partOneResponse.status, 201);

    const partOneId = partOneResponse.body.data.id;

    const partTwoResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `RECEIPT-B-${unique}`,

        description: "Receipt history part B",

        qtyOnHand: 0,

        costPrice: 15,

        sellPrice: 30,
      });

    assert.equal(partTwoResponse.status, 201);

    const partTwoId = partTwoResponse.body.data.id;

    //************************************************************** */
    // RO part lines

    const roPartOneResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId: partOneId,

        partNumber: partOneResponse.body.data.partNumber,

        description: "Receipt history part A",

        quantity: 2,

        requiredQty: 2,

        approvedQty: 2,

        unitPrice: 20,

        estimatedCost: 10,

        blocksWork: true,

        resolutionMethod: "ORIGINAL_PO",
      });

    assert.equal(roPartOneResponse.status, 201);

    const roPartOneId = roPartOneResponse.body.data.id;

    const roPartTwoResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId: partTwoId,

        partNumber: partTwoResponse.body.data.partNumber,

        description: "Receipt history part B",

        quantity: 1,

        requiredQty: 1,

        approvedQty: 1,

        unitPrice: 30,

        estimatedCost: 15,

        blocksWork: true,

        resolutionMethod: "ORIGINAL_PO",
      });

    assert.equal(roPartTwoResponse.status, 201);

    const roPartTwoId = roPartTwoResponse.body.data.id;

    for (const partLineId of [roPartOneId, roPartTwoId]) {
      const toBeOrderedResponse = await agent
        .post(
          `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/to-be-ordered`,
        )
        .send({});

      assert.equal(toBeOrderedResponse.status, 200);
    }

    //************************************************************** */
    // Move RO to WAITING_ON_PARTS

    const requestApprovalResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
      )
      .send({
        notes: "Receipt history estimate ready.",
      });

    assert.equal(requestApprovalResponse.status, 200);

    const approveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
      )
      .send({
        approvalMethod: "PHONE",

        approvedBy: "Receipt History Customer",
      });

    assert.equal(approveResponse.status, 200);

    assert.equal(approveResponse.body.data.status, "PARTS_REVIEW");

    const partsReviewResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
      )
      .send({
        notes: "Both blocking parts must be ordered.",
      });

    assert.equal(partsReviewResponse.status, 200);

    assert.equal(partsReviewResponse.body.data.status, "WAITING_ON_PARTS");

    //************************************************************** */
    // Create two-line PO

    const createPurchaseOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .send({
        vendorId,

        lines: [
          {
            partId: partOneId,

            repairOrderPartLineId: roPartOneId,

            orderedQty: 2,

            unitCost: 10,
          },
          {
            partId: partTwoId,

            repairOrderPartLineId: roPartTwoId,

            orderedQty: 1,

            unitCost: 15,
          },
        ],
      });

    assert.equal(createPurchaseOrderResponse.status, 201);

    const purchaseOrderId = createPurchaseOrderResponse.body.data.id;

    const purchaseOrderLineOneId =
      createPurchaseOrderResponse.body.data.lines[0].id;

    const purchaseOrderLineTwoId =
      createPurchaseOrderResponse.body.data.lines[1].id;

    //************************************************************** */
    // Order PO and verify ordered date exists

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    assert.equal(orderResponse.body.data.status, "ORDERED");

    assert.notEqual(orderResponse.body.data.orderedAt, null);

    //************************************************************** */
    // One Save Receipt containing both PO lines

    const receiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        invoiceNumber: "INV-HISTORY-1001",

        packingSlip: "PACK-HISTORY-1001",

        notes: "Complete shipment received together.",

        lines: [
          {
            purchaseOrderLineId: purchaseOrderLineOneId,

            quantity: 2,

            damagedQty: 0,

            backorderedQty: 0,

            actualCost: 9.75,

            binLocation: "A-10",

            notes: "Part A received in full.",
          },
          {
            purchaseOrderLineId: purchaseOrderLineTwoId,

            quantity: 1,

            damagedQty: 0,

            backorderedQty: 0,

            actualCost: 14.5,

            binLocation: "B-20",

            notes: "Part B received in full.",
          },
        ],
      });

    assert.equal(receiveResponse.status, 200);

    assert.equal(receiveResponse.body.data.status, "RECEIVED");

    assert.notEqual(receiveResponse.body.data.receivedAt, null);

    //************************************************************** */
    // Receipt history returned with PO

    assert.equal(receiveResponse.body.data.receipts.length, 1);

    const receipt = receiveResponse.body.data.receipts[0];

    assert.equal(receipt.purchaseOrderId, purchaseOrderId);

    assert.equal(receipt.invoiceNumber, "INV-HISTORY-1001");

    assert.equal(receipt.packingSlip, "PACK-HISTORY-1001");

    assert.equal(receipt.notes, "Complete shipment received together.");

    assert.notEqual(receipt.receivedAt, null);

    assert.equal(receipt.lines.length, 2);

    const receiptLineOne = receipt.lines.find(
      (line: { purchaseOrderLineId: string }) =>
        line.purchaseOrderLineId === purchaseOrderLineOneId,
    );

    const receiptLineTwo = receipt.lines.find(
      (line: { purchaseOrderLineId: string }) =>
        line.purchaseOrderLineId === purchaseOrderLineTwoId,
    );

    assert.ok(receiptLineOne);
    assert.ok(receiptLineTwo);

    assert.equal(Number(receiptLineOne.receivedQty), 2);
    assert.equal(Number(receiptLineOne.actualCost), 9.75);
    assert.equal(receiptLineOne.binLocation, "A-10");
    assert.equal(receiptLineOne.notes, "Part A received in full.");

    assert.equal(Number(receiptLineTwo.receivedQty), 1);
    assert.equal(Number(receiptLineTwo.actualCost), 14.5);
    assert.equal(receiptLineTwo.binLocation, "B-20");
    assert.equal(receiptLineTwo.notes, "Part B received in full.");

    //************************************************************** */
    // Inventory updated

    const partOneAfter = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partOneId}`,
    );

    assert.equal(partOneAfter.status, 200);
    assert.equal(Number(partOneAfter.body.data.qtyOnHand), 2);
    assert.equal(Number(partOneAfter.body.data.qtyOnOrder), 0);

    const partTwoAfter = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partTwoId}`,
    );

    assert.equal(partTwoAfter.status, 200);
    assert.equal(Number(partTwoAfter.body.data.qtyOnHand), 1);
    assert.equal(Number(partTwoAfter.body.data.qtyOnOrder), 0);

    //************************************************************** */
    // RO lines updated

    const roPartOneAfter = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${roPartOneId}`,
    );

    assert.equal(roPartOneAfter.status, 200);
    assert.equal(roPartOneAfter.body.data.status, "RECEIVED");
    assert.equal(Number(roPartOneAfter.body.data.receivedQty), 2);

    const roPartTwoAfter = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${roPartTwoId}`,
    );

    assert.equal(roPartTwoAfter.status, 200);
    assert.equal(roPartTwoAfter.body.data.status, "RECEIVED");
    assert.equal(Number(roPartTwoAfter.body.data.receivedQty), 1);

    //************************************************************** */
    // Corrected lifecycle: final blocking receipt releases RO directly

    const repairOrderAfter = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderAfter.status, 200);

    assert.equal(repairOrderAfter.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Receipt persists when PO is fetched later

    const fetchedPurchaseOrder = await agent.get(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
    );

    assert.equal(fetchedPurchaseOrder.status, 200);

    assert.equal(fetchedPurchaseOrder.body.data.receipts.length, 1);

    const persistedReceipt = fetchedPurchaseOrder.body.data.receipts[0];

    assert.equal(persistedReceipt.id, receipt.id);

    assert.equal(persistedReceipt.invoiceNumber, "INV-HISTORY-1001");

    assert.equal(persistedReceipt.packingSlip, "PACK-HISTORY-1001");

    assert.equal(persistedReceipt.lines.length, 2);
  });

  //************************************************************** */

  it("records receipt history for a special-order non-inventory PO line without changing inventory", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const unique = Date.now().toString();

    //************************************************************** */
    // Vendor

    const vendorResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vendors`)
      .send({
        name: `Special Order Receipt Vendor ${unique}`,
      });

    assert.equal(vendorResponse.status, 201);

    const vendorId = vendorResponse.body.data.id;

    //************************************************************** */
    // Manual / special-order PO line

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .send({
        vendorId,

        lines: [
          {
            partNumber: `SPECIAL-RECEIPT-${unique}`,

            description: "Special-order non-inventory component",

            orderedQty: 2,

            unitCost: 22.5,
          },
        ],
      });

    assert.equal(createResponse.status, 201);

    const purchaseOrderId = createResponse.body.data.id;

    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    assert.equal(createResponse.body.data.lines[0].partId, null);

    //************************************************************** */
    // Order

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    assert.notEqual(orderResponse.body.data.orderedAt, null);

    //************************************************************** */
    // Receive

    const receiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        invoiceNumber: "SPECIAL-INV-1",

        packingSlip: "SPECIAL-PACK-1",

        notes: "Special-order shipment received.",

        lines: [
          {
            purchaseOrderLineId,

            quantity: 2,

            actualCost: 21.95,

            binLocation: "SPECIAL-ORDER",

            notes: "Hold for repair order/customer.",
          },
        ],
      });

    assert.equal(receiveResponse.status, 200);

    assert.equal(receiveResponse.body.data.status, "RECEIVED");

    const receivedLine = receiveResponse.body.data.lines[0];

    assert.equal(receivedLine.partId, null);

    assert.equal(Number(receivedLine.receivedQty), 2);

    assert.equal(Number(receivedLine.actualCost), 21.95);

    //************************************************************** */
    // Persistent receipt history

    assert.equal(receiveResponse.body.data.receipts.length, 1);

    const receipt = receiveResponse.body.data.receipts[0];

    assert.equal(receipt.invoiceNumber, "SPECIAL-INV-1");

    assert.equal(receipt.packingSlip, "SPECIAL-PACK-1");

    assert.equal(receipt.lines.length, 1);

    assert.equal(receipt.lines[0].partId, null);

    assert.equal(receipt.lines[0].purchaseOrderLineId, purchaseOrderLineId);

    assert.equal(Number(receipt.lines[0].receivedQty), 2);

    assert.equal(Number(receipt.lines[0].actualCost), 21.95);

    assert.equal(receipt.lines[0].binLocation, "SPECIAL-ORDER");
  });

  //************************************************************** */

  it("rejects an over-receipt without creating a receipt history record", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const unique = Date.now().toString();

    const vendorResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vendors`)
      .send({
        name: `Atomic Receipt Vendor ${unique}`,
      });

    assert.equal(vendorResponse.status, 201);

    const vendorId = vendorResponse.body.data.id;

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `ATOMIC-RECEIPT-${unique}`,

        description: "Atomic receipt test part",

        qtyOnHand: 0,

        costPrice: 10,

        sellPrice: 20,
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

    const createResponse = await agent
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

    assert.equal(createResponse.status, 201);

    const purchaseOrderId = createResponse.body.data.id;

    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    //************************************************************** */
    // Invalid batch receipt

    const receiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        invoiceNumber: "INVALID-OVER-RECEIPT",

        lines: [
          {
            purchaseOrderLineId,

            quantity: 2,
          },
        ],
      });

    assert.equal(receiveResponse.status, 400);

    assert.equal(
      receiveResponse.body.code,
      "PURCHASE_ORDER_RECEIPT_EXCEEDS_REMAINING",
    );

    //************************************************************** */
    // No receipt or inventory mutation committed

    const fetchedPurchaseOrder = await agent.get(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
    );

    assert.equal(fetchedPurchaseOrder.status, 200);

    assert.equal(fetchedPurchaseOrder.body.data.receipts.length, 0);

    assert.equal(Number(fetchedPurchaseOrder.body.data.lines[0].receivedQty), 0);

    const fetchedPart = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/${partId}`,
    );

    assert.equal(fetchedPart.status, 200);

    assert.equal(Number(fetchedPart.body.data.qtyOnHand), 0);

    assert.equal(Number(fetchedPart.body.data.qtyOnOrder), 1);
  });
});

//************************************************************** */
