import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "./helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order work completion integration", () => {
  it("rejects labor completion while paused, then allows completion after resume", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Pause Work

    const pauseResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-order-work-status/repair-orders/${repairOrderId}/pause`,
      )
      .send({
        notes: "Pause before completing labor.",
      });

    assert.equal(pauseResponse.status, 200);

    assert.equal(pauseResponse.body.data.status, "PAUSED");

    //************************************************************** */
    // Completion Must Be Rejected While Paused

    const pausedCompletionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Invalid completion while paused.",
      });

    assert.equal(pausedCompletionResponse.status, 400);

    assert.equal(
      pausedCompletionResponse.body.code,
      "REPAIR_ORDER_LABOR_COMPLETE_INVALID_STATUS",
    );

    //************************************************************** */
    // Resume Work

    const resumeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-order-work-status/repair-orders/${repairOrderId}/resume`,
      )
      .send({
        notes: "Work resumed.",
      });

    assert.equal(resumeResponse.status, 200);

    assert.equal(resumeResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Complete Labor

    const completionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Labor completed after resume.",
      });

    assert.equal(completionResponse.status, 200);

    assert.equal(completionResponse.body.data.completed, true);

    assert.notEqual(completionResponse.body.data.completedAt, null);

    //************************************************************** */
    // Final Labor Completion → WORK_COMPLETE

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "WORK_COMPLETE");

    //************************************************************** */
    // Verify Automatic WORK_COMPLETE History

    const workCompleteHistory =
      repairOrderResponse.body.data.statusHistory.find(
        (history: {
          status: string;
          previousStatus: string | null;
          automatic: boolean;
        }) =>
          history.status === "WORK_COMPLETE" &&
          history.previousStatus === "IN_PROGRESS" &&
          history.automatic === true,
      );

    assert.notEqual(workCompleteHistory, undefined);
  });
});
