import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order reopen integration", () => {
  it("reopens completed work back to IN_PROGRESS and records history", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Complete labor → WORK_COMPLETE

    const completeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original work completed.",
      });

    assert.equal(completeResponse.status, 200);

    //************************************************************** */
    // Reopen

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
    // Verify history

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    const reopenHistory = repairOrderResponse.body.data.statusHistory.find(
      (item: {
        status: string;
        previousStatus: string | null;
        automatic: boolean;
        notes: string | null;
      }) =>
        item.status === "IN_PROGRESS" &&
        item.previousStatus === "WORK_COMPLETE" &&
        item.automatic === false,
    );

    assert.notEqual(reopenHistory, undefined);

    assert.equal(
      reopenHistory?.notes,
      "Customer requested additional service.",
    );
  });
});
