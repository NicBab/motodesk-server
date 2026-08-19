import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order additional-work guards integration", () => {
  it("rejects parts review routing when there are no unresolved blocking parts", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // RO is IN_PROGRESS but has no unresolved blocking parts.

    const response = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-work/parts-review`,
      )
      .send({
        notes: "Attempt parts review without blocking parts.",
      });

    assert.equal(response.status, 400);

    assert.equal(
      response.body.code,
      "REPAIR_ORDER_ADDITIONAL_WORK_NO_BLOCKING_PARTS",
    );

    //************************************************************** */
    // Verify RO remains IN_PROGRESS

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "IN_PROGRESS");
  });

  //************************************************************** */

  it("rejects additional-work parts review routing when the repair order is not IN_PROGRESS", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Add Blocking Part While Still IN_PROGRESS

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partNumber: "INVALID-STATUS-ADDITIONAL-PART",

        description: "Blocking part for invalid-status guard",

        quantity: 1,

        unitPrice: 50,

        requiredQty: 1,

        approvedQty: 1,

        status: "NEEDS_REVIEW",

        blocksWork: true,
      });

    assert.equal(partLineResponse.status, 201);

    //************************************************************** */
    // Complete Labor → WORK_COMPLETE

    const completionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original work completed.",
      });

    assert.equal(completionResponse.status, 200);

    const workCompleteResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(workCompleteResponse.status, 200);

    assert.equal(workCompleteResponse.body.data.status, "WORK_COMPLETE");

    //************************************************************** */
    // Attempt Additional-Work Parts Review From Wrong Status

    const response = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-work/parts-review`,
      )
      .send({
        notes: "Attempt parts review from WORK_COMPLETE.",
      });

    assert.equal(response.status, 400);

    assert.equal(
      response.body.code,
      "REPAIR_ORDER_ADDITIONAL_WORK_INVALID_STATUS",
    );

    //************************************************************** */
    // Verify Status Remains WORK_COMPLETE

    const finalResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalResponse.status, 200);

    assert.equal(finalResponse.body.data.status, "WORK_COMPLETE");
  });
});
