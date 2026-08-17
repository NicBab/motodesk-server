import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Repair Order readiness integration", () => {
  it("keeps an RO waiting while blocking parts are unresolved and automatically moves it to READY_TO_WORK when all blocking parts are received", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Readiness",

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

        make: "Honda",

        model: "CRF450R",

        vin: `READINESS-VIN-${uniqueSuffix}`,

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

        complaint: "Repair order readiness test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Move RO to WAITING_ON_PARTS

    const waitingResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
      )
      .send({
        status: "WAITING_ON_PARTS",

        notes: "Blocking parts required.",

        automatic: false,
      });

    assert.equal(waitingResponse.status, 200);

    assert.equal(waitingResponse.body.data.status, "WAITING_ON_PARTS");

    //************************************************************** */
    // Create first blocking part

    const firstPartResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `READY-A-${uniqueSuffix}`,

        description: "Readiness test part A",

        qtyOnHand: 0,

        costPrice: 10,

        sellPrice: 20,
      });

    assert.equal(firstPartResponse.status, 201);

    const firstPartId = firstPartResponse.body.data.id;

    //************************************************************** */
    // Create second blocking part

    const secondPartResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `READY-B-${uniqueSuffix}`,

        description: "Readiness test part B",

        qtyOnHand: 0,

        costPrice: 15,

        sellPrice: 30,
      });

    assert.equal(secondPartResponse.status, 201);

    const secondPartId = secondPartResponse.body.data.id;

    //************************************************************** */
    // First blocking RO part line

    const firstPartLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId: firstPartId,

        partNumber: `READY-A-${uniqueSuffix}`,

        description: "Readiness test part A",

        quantity: 1,

        requiredQty: 1,

        approvedQty: 1,

        unitPrice: 20,

        resolutionMethod: "ORIGINAL_PO",

        blocksWork: true,
      });

    assert.equal(firstPartLineResponse.status, 201);

    const firstPartLineId = firstPartLineResponse.body.data.id;

    //************************************************************** */
    // Second blocking RO part line

    const secondPartLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId: secondPartId,

        partNumber: `READY-B-${uniqueSuffix}`,

        description: "Readiness test part B",

        quantity: 1,

        requiredQty: 1,

        approvedQty: 1,

        unitPrice: 30,

        resolutionMethod: "ORIGINAL_PO",

        blocksWork: true,
      });

    assert.equal(secondPartLineResponse.status, 201);

    const secondPartLineId = secondPartLineResponse.body.data.id;

    //************************************************************** */
    // Mark both TO_BE_ORDERED

    const firstToBeOrdered = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${firstPartLineId}/to-be-ordered`,
      )
      .send({});

    assert.equal(firstToBeOrdered.status, 200);

    const secondToBeOrdered = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${secondPartLineId}/to-be-ordered`,
      )
      .send({});

    assert.equal(secondToBeOrdered.status, 200);

    //************************************************************** */
    // Vendor

    const vendorResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vendors`)
      .send({
        name: `Readiness Vendor ${uniqueSuffix}`,
      });

    assert.equal(vendorResponse.status, 201);

    const vendorId = vendorResponse.body.data.id;

    //************************************************************** */
    // Purchase Order with both blocking lines

    const purchaseOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .send({
        vendorId,

        lines: [
          {
            partId: firstPartId,

            repairOrderPartLineId: firstPartLineId,

            orderedQty: 1,

            unitCost: 10,
          },

          {
            partId: secondPartId,

            repairOrderPartLineId: secondPartLineId,

            orderedQty: 1,

            unitCost: 15,
          },
        ],
      });

    assert.equal(purchaseOrderResponse.status, 201);

    const purchaseOrderId = purchaseOrderResponse.body.data.id;

    const firstPurchaseOrderLineId = purchaseOrderResponse.body.data.lines.find(
      (line: { partId: string; id: string }) => line.partId === firstPartId,
    )?.id;

    const secondPurchaseOrderLineId =
      purchaseOrderResponse.body.data.lines.find(
        (line: { partId: string; id: string }) => line.partId === secondPartId,
      )?.id;

    assert.equal(typeof firstPurchaseOrderLineId, "string");

    assert.equal(typeof secondPurchaseOrderLineId, "string");

    //************************************************************** */
    // Order PO

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    //************************************************************** */
    // Receive first blocking part

    const firstReceiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId: firstPurchaseOrderLineId,

        quantity: 1,
      });

    assert.equal(firstReceiveResponse.status, 200);

    //************************************************************** */
    // RO must still be WAITING_ON_PARTS

    const afterFirstReceipt = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(afterFirstReceipt.status, 200);

    assert.equal(afterFirstReceipt.body.data.status, "WAITING_ON_PARTS");

    //************************************************************** */
    // Receive second/final blocking part

    const secondReceiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId: secondPurchaseOrderLineId,

        quantity: 1,
      });

    assert.equal(secondReceiveResponse.status, 200);

    //************************************************************** */
    // RO automatically releases

    const readyRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(readyRepairOrderResponse.status, 200);

    assert.equal(readyRepairOrderResponse.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Verify automatic status-history event

    const automaticReadyHistory =
      readyRepairOrderResponse.body.data.statusHistory.find(
        (history: {
          status: string;
          previousStatus: string | null;
          automatic: boolean;
        }) =>
          history.status === "READY_TO_WORK" &&
          history.previousStatus === "WAITING_ON_PARTS" &&
          history.automatic === true,
      );

    assert.notEqual(automaticReadyHistory, undefined);
  });
});
