import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order declined additional-work cleanup integration", () => {
  it("cancels declined proposed labor and parts without blocking completion of the original work", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    const suffix = `${Date.now()}-${Math.random()}`;

    //************************************************************** */
    // Add Proposed Additional Labor

    const proposedLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      )
      .send({
        description: "Customer-requested additional labor",

        hours: 1,

        rate: 135,
      });

    assert.equal(proposedLaborResponse.status, 201);

    assert.equal(proposedLaborResponse.body.data.status, "PROPOSED");

    const additionalLaborLineId = proposedLaborResponse.body.data.id;

    //************************************************************** */
    // Add Proposed Additional Blocking Part

    const proposedPartResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partNumber: `DECLINED-ADDITIONAL-${suffix}`,

        description: "Customer-requested additional part",

        quantity: 1,

        unitPrice: 125,

        requiredQty: 1,

        approvedQty: 0,

        estimatedCost: 70,

        status: "NEEDS_REVIEW",

        blocksWork: true,
      });

    assert.equal(proposedPartResponse.status, 201);

    assert.equal(proposedPartResponse.body.data.status, "NEEDS_REVIEW");

    assert.equal(proposedPartResponse.body.data.blocksWork, true);

    const additionalPartLineId = proposedPartResponse.body.data.id;

    //************************************************************** */
    // Request Customer Approval

    const requestApprovalResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/request`,
      )
      .send({
        notes: "Additional labor and part require customer approval.",
      });

    assert.equal(requestApprovalResponse.status, 200);

    assert.equal(
      requestApprovalResponse.body.data.status,
      "WAITING_ON_ADDITIONAL_APPROVAL",
    );

    //************************************************************** */
    // Customer Declines Additional Work

    const declineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/decline`,
      )
      .send({
        notes: "Customer declined the additional repair.",
      });

    assert.equal(declineResponse.status, 200);

    assert.equal(declineResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Cancel Declined Proposed Labor

    const cancelLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${additionalLaborLineId}/cancel`,
      )
      .send({
        notes: "Cancelled because customer declined additional work.",
      });

    assert.equal(cancelLaborResponse.status, 200);

    assert.equal(cancelLaborResponse.body.data.status, "CANCELLED");

    assert.equal(cancelLaborResponse.body.data.completed, false);

    assert.equal(cancelLaborResponse.body.data.startedAt, null);

    //************************************************************** */
    // Cancel Declined Proposed Part

    const cancelPartResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${additionalPartLineId}/cancel`,
      )
      .send({
        notes: "Cancelled because customer declined additional work.",
      });

    assert.equal(cancelPartResponse.status, 200);

    assert.equal(cancelPartResponse.body.data.status, "CANCELLED");

    assert.equal(cancelPartResponse.body.data.blocksWork, false);

    //************************************************************** */
    // Verify Declined Lines Remain Persisted

    const laborLineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${additionalLaborLineId}`,
    );

    assert.equal(laborLineResponse.status, 200);

    assert.equal(laborLineResponse.body.data.status, "CANCELLED");

    const partLineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${additionalPartLineId}`,
    );

    assert.equal(partLineResponse.status, 200);

    assert.equal(partLineResponse.body.data.status, "CANCELLED");

    assert.equal(partLineResponse.body.data.blocksWork, false);

    //************************************************************** */
    // Complete Original Approved Labor
    //
    // Cancelled additional labor must not count as incomplete.

    const completeOriginalLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original approved repair completed.",
      });

    assert.equal(completeOriginalLaborResponse.status, 200);

    //************************************************************** */
    // Repair Order Must Reach WORK_COMPLETE

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "WORK_COMPLETE");

    //************************************************************** */
    // Verify Decline History Remains Available

    const declineHistory = repairOrderResponse.body.data.statusHistory.find(
      (history: {
        status: string;
        previousStatus: string | null;
        notes: string | null;
      }) =>
        history.status === "IN_PROGRESS" &&
        history.previousStatus === "WAITING_ON_ADDITIONAL_APPROVAL",
    );

    assert.notEqual(declineHistory, undefined);

    assert.equal(
      declineHistory?.notes,
      "Customer declined the additional repair.",
    );
  });

  //************************************************************** */

  it("rejects simple cancellation of a part after inventory activity has begun", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    const suffix = `${Date.now()}-${Math.random()}`;

    //************************************************************** */
    // Create Inventory Part

    const inventoryPartResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `CANCEL-GUARD-${suffix}`,

        description: "Cancellation guard inventory part",

        qtyOnHand: 5,

        costPrice: 40,

        sellPrice: 80,
      });

    assert.equal(inventoryPartResponse.status, 201);

    const inventoryPartId = inventoryPartResponse.body.data.id;

    //************************************************************** */
    // Add Inventory-Backed RO Part

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId: inventoryPartId,

        partNumber: `CANCEL-GUARD-${suffix}`,

        description: "Cancellation guard inventory part",

        quantity: 1,

        unitPrice: 80,

        requiredQty: 1,

        approvedQty: 1,

        blocksWork: true,
      });

    assert.equal(partLineResponse.status, 201);

    const partLineId = partLineResponse.body.data.id;

    //************************************************************** */
    // Allocate Inventory
    //
    // Once allocation occurs this is no longer merely a proposal.

    const allocationResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/allocate`,
      )
      .send({
        quantity: 1,

        notes: "Allocated for cancellation guard test.",
      });

    assert.equal(allocationResponse.status, 200);

    //************************************************************** */
    // Simple Cancellation Must Be Rejected

    const cancelResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/cancel`,
      )
      .send({
        notes: "Attempting invalid cancellation after allocation.",
      });

    assert.equal(cancelResponse.status, 400);

    assert.equal(
      cancelResponse.body.code,
      "REPAIR_ORDER_PART_CANCEL_INVALID_STATUS",
    );
  });
});
