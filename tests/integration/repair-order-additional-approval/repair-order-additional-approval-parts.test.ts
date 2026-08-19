import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order additional-work approval parts integration", () => {
  it("moves approved additional work to PARTS_REVIEW when unresolved blocking parts exist", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    const suffix = `${Date.now()}-${Math.random()}`;

    //************************************************************** */
    // Add New Blocking Part

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partNumber: `ADDITIONAL-APPROVAL-${suffix}`,

        description: "Additional-work blocking part",

        quantity: 1,

        unitPrice: 125,

        requiredQty: 1,

        approvedQty: 0,

        estimatedCost: 70,

        status: "NEEDS_REVIEW",

        blocksWork: true,
      });

    assert.equal(partLineResponse.status, 201);

    assert.equal(partLineResponse.body.data.status, "NEEDS_REVIEW");

    assert.equal(partLineResponse.body.data.blocksWork, true);

    //************************************************************** */
    // Request Additional Approval

    const requestResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/request`,
      )
      .send({
        notes: "Additional service requires customer approval and a new part.",
      });

    assert.equal(requestResponse.status, 200);

    assert.equal(
      requestResponse.body.data.status,
      "WAITING_ON_ADDITIONAL_APPROVAL",
    );

    //************************************************************** */
    // Approve Additional Work
    //
    // Because an unresolved blocking part exists,
    // approval must route the RO to PARTS_REVIEW.

    const approveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/approve`,
      )
      .send({
        approvalMethod: "PHONE",

        approvedBy: "Additional Work Customer",

        approvedAmount: 250,

        notes: "Customer approved additional service and required part.",
      });

    assert.equal(approveResponse.status, 200);

    assert.equal(approveResponse.body.data.status, "PARTS_REVIEW");

    //************************************************************** */
    // Verify Persisted Status

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "PARTS_REVIEW");

    //************************************************************** */
    // Verify Status History

    const approvalHistory = repairOrderResponse.body.data.statusHistory.find(
      (history: {
        status: string;
        previousStatus: string | null;
        automatic: boolean;
        notes: string | null;
      }) =>
        history.status === "PARTS_REVIEW" &&
        history.previousStatus === "WAITING_ON_ADDITIONAL_APPROVAL" &&
        history.automatic === false,
    );

    assert.notEqual(approvalHistory, undefined);

    assert.equal(
      approvalHistory?.notes,
      "Customer approved additional service and required part.",
    );
  });
});
