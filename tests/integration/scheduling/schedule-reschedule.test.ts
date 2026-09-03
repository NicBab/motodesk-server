import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  createSchedulingFixture,
  scheduleFixtureRepairOrder,
} from "./helpers/scheduling.fixture.js";

//************************************************************** */

describe("Schedule rescheduling integration", () => {
  it("reschedules a repair order while preserving the previous work block as history", async () => {
    const fixture = await createSchedulingFixture();

    const initialSchedule = await scheduleFixtureRepairOrder(fixture, {
      scheduledDate: "2026-09-03T14:00:00.000Z",

      scheduledEnd: "2026-09-03T16:00:00.000Z",

      notes: "Initial schedule.",
    });

    const newScheduledDate = "2026-09-05T16:30:00.000Z";

    const newScheduledEnd = "2026-09-05T19:00:00.000Z";

    const promisedDate = "2026-09-06T22:00:00.000Z";

    //************************************************************** */
    // Reschedule

    const response = await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/repair-orders/${fixture.repairOrder.id}/reschedule`,
      )
      .send({
        technicianEmployeeId: fixture.technician.id,

        scheduledDate: newScheduledDate,

        scheduledEnd: newScheduledEnd,

        promisedDate,

        waitingCustomer: true,

        notes: "Customer requested a later appointment.",
      });

    assert.equal(response.status, 200);

    const replacement = response.body.data;

    assert.notEqual(replacement.id, initialSchedule.id);

    assert.equal(replacement.repairOrderId, fixture.repairOrder.id);

    assert.equal(replacement.technicianEmployeeId, fixture.technician.id);

    assert.equal(replacement.status, "SCHEDULED");

    assert.equal(replacement.waitingCustomer, true);

    assert.equal(
      new Date(replacement.scheduledDate).toISOString(),
      newScheduledDate,
    );

    assert.equal(
      new Date(replacement.scheduledEnd).toISOString(),
      newScheduledEnd,
    );

    //************************************************************** */
    // RO remains scheduled.

    const repairOrderResponse = await fixture.agent.get(
      `/api/v1/organizations/${fixture.organizationId}/repair-orders/${fixture.repairOrder.id}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "SCHEDULED");

    assert.equal(
      new Date(repairOrderResponse.body.data.scheduledDate).toISOString(),
      newScheduledDate,
    );

    assert.equal(
      new Date(repairOrderResponse.body.data.promisedDate).toISOString(),
      promisedDate,
    );
  });
});

//************************************************************** */
