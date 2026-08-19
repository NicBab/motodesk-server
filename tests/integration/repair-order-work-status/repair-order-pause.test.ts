import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "./helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order pause integration", () => {
  it("pauses an in-progress repair order and records the transition", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Pause Work

    const pauseResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-order-work-status/repair-orders/${repairOrderId}/pause`,
      )
      .send({
        notes: "Waiting for customer clarification.",
      });

    assert.equal(pauseResponse.status, 200);

    assert.equal(pauseResponse.body.data.status, "PAUSED");

    //************************************************************** */
    // Verify Persisted Status

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "PAUSED");

    //************************************************************** */
    // Verify Status History

    const pauseHistory = repairOrderResponse.body.data.statusHistory.find(
      (history: {
        status: string;
        previousStatus: string | null;
        automatic: boolean;
        notes: string | null;
      }) =>
        history.status === "PAUSED" &&
        history.previousStatus === "IN_PROGRESS" &&
        history.automatic === false,
    );

    assert.notEqual(pauseHistory, undefined);

    assert.equal(pauseHistory?.notes, "Waiting for customer clarification.");
  });

  //************************************************************** */

  // it(
  //   "rejects pausing a repair order that is not in progress",
  //   async () => {
  //     const {
  //       agent,
  //       organizationId,
  //     } =
  //       await createInProgressRepairOrderFixture();

  //     // First pause is valid.

  //     const firstPauseResponse =
  //       await agent
  //         .post(
  //           `/api/v1/organizations/${organizationId}/repair-order-work-status/repair-orders/${arguments[0]}/pause`,
  //         );
  //   },
  // );
});
