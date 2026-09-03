import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  createSchedulingFixture,
  scheduleFixtureRepairOrder,
} from "./helpers/scheduling.fixture.js";

//************************************************************** */

describe("Schedule cancellation integration", () => {
  it("cancels the active work block and returns the RO to READY_TO_WORK", async () => {
    const fixture = await createSchedulingFixture();

    const schedule = await scheduleFixtureRepairOrder(fixture);

    //************************************************************** */
    // Cancel Schedule

    const cancellationResponse = await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/repair-orders/${fixture.repairOrder.id}/cancel`,
      )
      .send({
        notes: "Customer requested schedule cancellation.",
      });

    assert.equal(cancellationResponse.status, 200);

    assert.equal(cancellationResponse.body.data.id, schedule.id);

    assert.equal(cancellationResponse.body.data.status, "CANCELLED");

    assert.notEqual(cancellationResponse.body.data.cancelledAt, null);

    assert.equal(
      cancellationResponse.body.data.cancellationNotes,
      "Customer requested schedule cancellation.",
    );

    //************************************************************** */
    // RO returns to READY_TO_WORK

    const repairOrderResponse = await fixture.agent.get(
      `/api/v1/organizations/${fixture.organizationId}/repair-orders/${fixture.repairOrder.id}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "READY_TO_WORK");

    assert.equal(repairOrderResponse.body.data.scheduledDate, null);

    //************************************************************** */
    // Verify lifecycle history

    const history = repairOrderResponse.body.data.statusHistory.find(
      (item: { status: string; previousStatus: string | null }) =>
        item.status === "READY_TO_WORK" && item.previousStatus === "SCHEDULED",
    );

    assert.notEqual(history, undefined);
  });
});

//************************************************************** */
