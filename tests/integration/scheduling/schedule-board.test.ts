import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  createSchedulingFixture,
  scheduleFixtureRepairOrder,
} from "./helpers/scheduling.fixture.js";

//************************************************************** */

describe("Scheduling dispatch board integration", () => {
  it("returns schedulable technicians, work blocks, and unscheduled READY_TO_WORK repair orders", async () => {
    //************************************************************** */
    // First RO stays unscheduled.

    const unscheduledFixture = await createSchedulingFixture();

    //************************************************************** */
    // Second RO gets scheduled.

    const scheduledFixture = await createSchedulingFixture();

    const scheduledDate = "2026-09-03T14:00:00.000Z";

    const scheduledEnd = "2026-09-03T16:00:00.000Z";

    const schedule = await scheduleFixtureRepairOrder(scheduledFixture, {
      scheduledDate,
      scheduledEnd,
    });

    //************************************************************** */
    // Read board from scheduled fixture's organization.
    //
    // Each authenticated fixture owns a different organization,
    // so validate scheduled data in that organization first.

    const scheduledBoardResponse = await scheduledFixture.agent
      .get(
        `/api/v1/organizations/${scheduledFixture.organizationId}/scheduling`,
      )
      .query({
        start: "2026-09-03T00:00:00.000Z",

        end: "2026-09-04T00:00:00.000Z",
      });

    assert.equal(scheduledBoardResponse.status, 200);

    const scheduledBoard = scheduledBoardResponse.body.data;

    //************************************************************** */
    // Technician

    const technician = scheduledBoard.technicians.find(
      (item: { id: string }) => item.id === scheduledFixture.technician.id,
    );

    assert.notEqual(technician, undefined);

    //************************************************************** */
    // Schedule

    const boardSchedule = scheduledBoard.schedules.find(
      (item: { id: string }) => item.id === schedule.id,
    );

    assert.notEqual(boardSchedule, undefined);

    assert.equal(boardSchedule.repairOrderId, scheduledFixture.repairOrder.id);

    assert.equal(
      boardSchedule.technicianEmployeeId,
      scheduledFixture.technician.id,
    );

    //************************************************************** */
    // Scheduled RO must not appear in READY_TO_WORK list.

    const scheduledAsUnscheduled = scheduledBoard.unscheduledRepairOrders.find(
      (item: { id: string }) => item.id === scheduledFixture.repairOrder.id,
    );

    assert.equal(scheduledAsUnscheduled, undefined);

    //************************************************************** */
    // Verify an unscheduled READY_TO_WORK RO remains available
    // without requiring Scheduling.

    const unscheduledBoardResponse = await unscheduledFixture.agent
      .get(
        `/api/v1/organizations/${unscheduledFixture.organizationId}/scheduling`,
      )
      .query({
        start: "2026-09-03T00:00:00.000Z",

        end: "2026-09-04T00:00:00.000Z",
      });

    assert.equal(unscheduledBoardResponse.status, 200);

    const unscheduledRO =
      unscheduledBoardResponse.body.data.unscheduledRepairOrders.find(
        (item: { id: string }) => item.id === unscheduledFixture.repairOrder.id,
      );

    assert.notEqual(unscheduledRO, undefined);

    assert.equal(unscheduledRO.status, "READY_TO_WORK");
  });

  //************************************************************** */

  it("does not return cancelled work blocks on the active dispatch board", async () => {
    const fixture = await createSchedulingFixture();

    const schedule = await scheduleFixtureRepairOrder(fixture);

    //************************************************************** */
    // Cancel

    const cancelResponse = await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/repair-orders/${fixture.repairOrder.id}/cancel`,
      )
      .send({
        notes: "Cancelled for board visibility test.",
      });

    assert.equal(cancelResponse.status, 200);

    //************************************************************** */
    // Board

    const boardResponse = await fixture.agent
      .get(`/api/v1/organizations/${fixture.organizationId}/scheduling`)
      .query({
        start: "2026-09-03T00:00:00.000Z",

        end: "2026-09-04T00:00:00.000Z",
      });

    assert.equal(boardResponse.status, 200);

    const cancelledBlock = boardResponse.body.data.schedules.find(
      (item: { id: string }) => item.id === schedule.id,
    );

    assert.equal(cancelledBlock, undefined);

    //************************************************************** */
    // RO becomes unscheduled READY_TO_WORK again.

    const returnedRO = boardResponse.body.data.unscheduledRepairOrders.find(
      (item: { id: string }) => item.id === fixture.repairOrder.id,
    );

    assert.notEqual(returnedRO, undefined);
  });
});

//************************************************************** */
