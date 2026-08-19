import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order additional-work resume integration", () => {
  it("routes reopened work through parts review and returns it to active labor when the new part is ready", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    const suffix = `${Date.now()}-${Math.random()}`;

    //************************************************************** */
    // Complete Original Work

    const originalCompletionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original repair completed.",
      });

    assert.equal(originalCompletionResponse.status, 200);

    //************************************************************** */
    // Verify WORK_COMPLETE

    const completedRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(completedRepairOrderResponse.status, 200);

    assert.equal(
      completedRepairOrderResponse.body.data.status,
      "WORK_COMPLETE",
    );

    //************************************************************** */
    // Customer Adds Additional Work
    // Reopen → IN_PROGRESS

    const reopenResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/reopen`,
      )
      .send({
        notes: "Customer requested an additional service.",
      });

    assert.equal(reopenResponse.status, 200);

    assert.equal(reopenResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Create Inventory Part With Available Stock

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `ADDITIONAL-STOCK-${suffix}`,

        description: "Additional-work stocked part",

        qtyOnHand: 5,

        costPrice: 30,

        sellPrice: 60,
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

    //************************************************************** */
    // Add New Blocking Part To RO

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId,

        partNumber: `ADDITIONAL-STOCK-${suffix}`,

        description: "Additional-work stocked part",

        quantity: 1,

        unitPrice: 60,

        requiredQty: 1,

        approvedQty: 1,

        estimatedCost: 30,

        resolutionMethod: "SHOP_INVENTORY",

        blocksWork: true,
      });

    assert.equal(partLineResponse.status, 201);

    assert.equal(partLineResponse.body.data.status, "NEEDS_REVIEW");

    const partLineId = partLineResponse.body.data.id;

    //************************************************************** */
    // Explicitly Return Additional Work To Parts Review

    const sendToPartsReviewResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-work/parts-review`,
      )
      .send({
        notes: "New customer-requested service requires a stocked part.",
      });

    assert.equal(sendToPartsReviewResponse.status, 200);

    assert.equal(sendToPartsReviewResponse.body.data.status, "PARTS_REVIEW");

    //************************************************************** */
    // Allocate From Stock

    const allocationResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/allocate`,
      )
      .send({
        quantity: 1,
      });

    assert.equal(allocationResponse.status, 200);

    assert.equal(Number(allocationResponse.body.data.allocatedQty), 1);

    //************************************************************** */
    // Pull From Shelf

    const pullResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/pull`,
      )
      .send({
        quantity: 1,

        notes: "Additional-work part pulled from inventory.",
      });

    assert.equal(pullResponse.status, 200);

    assert.equal(pullResponse.body.data.status, "PULLED");

    //************************************************************** */
    // Stage For Technician

    const stageResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/stage`,
      )
      .send({
        notes: "Additional-work part staged for technician.",
      });

    assert.equal(stageResponse.status, 200);

    assert.equal(stageResponse.body.data.status, "STAGED");

    //************************************************************** */
    // Complete Parts Review
    // All blocking requirements are now physically ready.

    const completePartsReviewResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
      )
      .send({
        notes: "Additional-work parts review complete.",
      });

    assert.equal(completePartsReviewResponse.status, 200);

    assert.equal(completePartsReviewResponse.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Add New Labor For Additional Service

    const additionalLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      )
      .send({
        description: "Perform customer-requested additional service",

        hours: 1,

        rate: 135,
      });

    assert.equal(additionalLaborResponse.status, 201);

    const additionalLaborLineId = additionalLaborResponse.body.data.id;

    //************************************************************** */
    // Start Additional Labor
    // READY_TO_WORK → IN_PROGRESS

    const startAdditionalLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${additionalLaborLineId}/start`,
      )
      .send({
        notes: "Technician began additional customer-requested work.",
      });

    assert.equal(startAdditionalLaborResponse.status, 200);

    //************************************************************** */
    // Verify RO Returned To IN_PROGRESS

    const finalRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalRepairOrderResponse.status, 200);

    assert.equal(finalRepairOrderResponse.body.data.status, "IN_PROGRESS");
  });
});
