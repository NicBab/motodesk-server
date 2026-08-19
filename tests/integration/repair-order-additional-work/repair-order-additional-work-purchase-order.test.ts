import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order additional-work purchase-order integration", () => {
  it("routes reopened work through purchasing and returns it to active labor after the ordered part is received and staged", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    const suffix = `${Date.now()}-${Math.random()}`;

    //************************************************************** */
    // Complete Original Work → WORK_COMPLETE

    const originalCompletionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original repair completed.",
      });

    assert.equal(originalCompletionResponse.status, 200);

    const workCompleteResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(workCompleteResponse.status, 200);

    assert.equal(workCompleteResponse.body.data.status, "WORK_COMPLETE");

    //************************************************************** */
    // Reopen For Additional Work → IN_PROGRESS

    const reopenResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/reopen`,
      )
      .send({
        notes:
          "Customer requested additional service requiring an ordered part.",
      });

    assert.equal(reopenResponse.status, 200);

    assert.equal(reopenResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Create Inventory Part
    //
    // Purchase-order lines require a real Part ID.

    const partNumber = `ADDITIONAL-ORDER-${suffix}`;

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber,

        description: "Additional-work ordered part",

        qtyOnHand: 0,

        costPrice: 85,

        sellPrice: 150,
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

    //************************************************************** */
    // Add New Blocking Part Requirement

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId,

        partNumber,

        description: "Additional-work ordered part",

        quantity: 1,

        unitPrice: 150,

        requiredQty: 1,

        approvedQty: 1,

        estimatedCost: 85,

        resolutionMethod: "ORIGINAL_PO",

        blocksWork: true,
      });

    assert.equal(partLineResponse.status, 201);

    assert.equal(partLineResponse.body.data.status, "NEEDS_REVIEW");

    const repairOrderPartLineId = partLineResponse.body.data.id;

    //************************************************************** */
    // Send Additional Work To Parts Review

    const partsReviewResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-work/parts-review`,
      )
      .send({
        notes: "Additional service requires an ordered part.",
      });

    assert.equal(partsReviewResponse.status, 200);

    assert.equal(partsReviewResponse.body.data.status, "PARTS_REVIEW");

    //************************************************************** */
    // Parts Manager Marks Part TO_BE_ORDERED

    const toBeOrderedResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}/to-be-ordered`,
      )
      .send({
        notes: "Part must be purchased for additional customer-requested work.",
      });

    assert.equal(toBeOrderedResponse.status, 200);

    assert.equal(toBeOrderedResponse.body.data.status, "TO_BE_ORDERED");

    //************************************************************** */
    // Complete Parts Review → WAITING_ON_PARTS

    const completePartsReviewResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
      )
      .send({
        notes:
          "Additional-work parts review complete. Waiting on ordered part.",
      });

    assert.equal(completePartsReviewResponse.status, 200);

    assert.equal(
      completePartsReviewResponse.body.data.status,
      "WAITING_ON_PARTS",
    );

    //************************************************************** */
    // Create Vendor

    const vendorResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vendors`)
      .send({
        name: `Additional Work Vendor ${suffix}`,
      });

    assert.equal(vendorResponse.status, 201);

    const vendorId = vendorResponse.body.data.id;

    //************************************************************** */
    // Create Purchase Order
    //
    // The current API requires lines[] at PO creation.

    const purchaseOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
      .send({
        vendorId,

        notes: "Purchase order for reopened additional work.",

        lines: [
          {
            partId,

            repairOrderPartLineId,

            orderedQty: 1,

            unitCost: 85,
          },
        ],
      });

    assert.equal(purchaseOrderResponse.status, 201);

    const purchaseOrderId = purchaseOrderResponse.body.data.id;

    const purchaseOrderLineId = purchaseOrderResponse.body.data.lines[0].id;

    //************************************************************** */
    // Order Purchase Order

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    assert.equal(orderResponse.body.data.status, "ORDERED");

    //************************************************************** */
    // Receive Purchase Order Line

    const receiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
      )
      .send({
        purchaseOrderLineId,

        quantity: 1,

        notes: "Additional-work part received.",
      });

    assert.equal(receiveResponse.status, 200);

    assert.equal(receiveResponse.body.data.status, "RECEIVED");

    assert.equal(Number(receiveResponse.body.data.lines[0].receivedQty), 1);

    //************************************************************** */
    // Linked RO Part Line Is RECEIVED

    const receivedPartLineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
    );

    assert.equal(receivedPartLineResponse.status, 200);

    assert.equal(receivedPartLineResponse.body.data.status, "RECEIVED");

    assert.equal(Number(receivedPartLineResponse.body.data.receivedQty), 1);

    //************************************************************** */
    // Receipt Alone Must NOT Release RO

    const afterReceiveResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(afterReceiveResponse.status, 200);

    assert.equal(afterReceiveResponse.body.data.status, "WAITING_ON_PARTS");

    //************************************************************** */
    // Stage Received Part

    const stageResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}/stage`,
      )
      .send({
        notes: "Received additional-work part staged for technician.",
      });

    assert.equal(stageResponse.status, 200);

    assert.equal(stageResponse.body.data.status, "STAGED");

    //************************************************************** */
    // Final Blocking Part Staged → READY_TO_WORK

    const readyResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(readyResponse.status, 200);

    assert.equal(readyResponse.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Add Labor For Additional Work

    const additionalLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      )
      .send({
        description: "Perform additional customer-requested service",

        hours: 1,

        rate: 135,
      });

    assert.equal(additionalLaborResponse.status, 201);

    const additionalLaborLineId = additionalLaborResponse.body.data.id;

    //************************************************************** */
    // Start Additional Labor → IN_PROGRESS

    const startLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${additionalLaborLineId}/start`,
      )
      .send({
        notes: "Technician resumed additional work.",
      });

    assert.equal(startLaborResponse.status, 200);

    //************************************************************** */
    // Verify Final RO State

    const finalRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalRepairOrderResponse.status, 200);

    assert.equal(finalRepairOrderResponse.body.data.status, "IN_PROGRESS");
  });
});
