import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "./helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order resume integration", () => {
  it("resumes a paused repair order and records the transition", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Pause Work

    const pauseResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-order-work-status/repair-orders/${repairOrderId}/pause`,
      )
      .send({
        notes: "Waiting for diagnostic information.",
      });

    assert.equal(pauseResponse.status, 200);

    assert.equal(pauseResponse.body.data.status, "PAUSED");

    //************************************************************** */
    // Resume Work

    const resumeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-order-work-status/repair-orders/${repairOrderId}/resume`,
      )
      .send({
        notes: "Diagnostic information received.",
      });

    assert.equal(resumeResponse.status, 200);

    assert.equal(resumeResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Verify Persisted Status

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Verify Resume History

    const resumeHistory = repairOrderResponse.body.data.statusHistory.find(
      (history: {
        status: string;
        previousStatus: string | null;
        automatic: boolean;
        notes: string | null;
      }) =>
        history.status === "IN_PROGRESS" &&
        history.previousStatus === "PAUSED" &&
        history.automatic === false,
    );

    assert.notEqual(resumeHistory, undefined);

    assert.equal(resumeHistory?.notes, "Diagnostic information received.");
  });
});
