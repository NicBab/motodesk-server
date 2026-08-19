import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order additional-work parts-review integration", () => {
  it("returns reopened work to PARTS_REVIEW when new blocking parts require review", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Complete Existing Labor → WORK_COMPLETE

    const completionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original work completed.",
      });

    assert.equal(completionResponse.status, 200);

    //************************************************************** */
    // Reopen For Additional Work → IN_PROGRESS

    const reopenResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/reopen`,
      )
      .send({
        notes: "Customer requested additional service.",
      });

    assert.equal(reopenResponse.status, 200);

    assert.equal(reopenResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Add New Blocking Part Requirement

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partNumber: "ADDITIONAL-WORK-PART",

        description: "Additional service blocking part",

        quantity: 1,

        unitPrice: 75,

        requiredQty: 1,

        approvedQty: 1,

        status: "NEEDS_REVIEW",

        blocksWork: true,
      });

    assert.equal(partLineResponse.status, 201);

    assert.equal(partLineResponse.body.data.status, "NEEDS_REVIEW");

    assert.equal(partLineResponse.body.data.blocksWork, true);

    //************************************************************** */
    // Send Additional Work To Parts Review

    const partsReviewResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-work/parts-review`,
      )
      .send({
        notes: "Additional customer-requested work requires parts review.",
      });

    assert.equal(partsReviewResponse.status, 200);

    assert.equal(partsReviewResponse.body.data.status, "PARTS_REVIEW");

    //************************************************************** */
    // Verify Persisted RO State And History

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "PARTS_REVIEW");

    const history = repairOrderResponse.body.data.statusHistory.find(
      (item: {
        status: string;
        previousStatus: string | null;
        automatic: boolean;
        notes: string | null;
      }) =>
        item.status === "PARTS_REVIEW" &&
        item.previousStatus === "IN_PROGRESS" &&
        item.automatic === false,
    );

    assert.notEqual(history, undefined);

    assert.equal(
      history?.notes,
      "Additional customer-requested work requires parts review.",
    );
  });
});
