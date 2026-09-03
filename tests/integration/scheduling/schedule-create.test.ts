import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

import { createSchedulingFixture } from "./helpers/scheduling.fixture.js";

//************************************************************** */

describe("Schedule creation integration", () => {
  it("optionally schedules a READY_TO_WORK repair order as a technician work block", async () => {
    const fixture = await createSchedulingFixture();

    const scheduledDate = "2026-09-03T14:00:00.000Z";

    const scheduledEnd = "2026-09-03T16:30:00.000Z";

    const promisedDate = "2026-09-04T22:00:00.000Z";

    //************************************************************** */
    // Schedule RO

    const scheduleResponse = await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/repair-orders/${fixture.repairOrder.id}`,
      )
      .send({
        technicianEmployeeId: fixture.technician.id,

        scheduledDate,

        scheduledEnd,

        promisedDate,

        waitingCustomer: true,

        notes: "Scheduled by service manager.",
      });

    assert.equal(scheduleResponse.status, 200);

    assert.equal(
      scheduleResponse.body.data.organizationId,
      fixture.organizationId,
    );

    assert.equal(
      scheduleResponse.body.data.repairOrderId,
      fixture.repairOrder.id,
    );

    assert.equal(
      scheduleResponse.body.data.technicianEmployeeId,
      fixture.technician.id,
    );

    assert.equal(scheduleResponse.body.data.status, "SCHEDULED");

    assert.equal(scheduleResponse.body.data.waitingCustomer, true);

    assert.equal(
      new Date(scheduleResponse.body.data.scheduledDate).toISOString(),
      scheduledDate,
    );

    assert.equal(
      new Date(scheduleResponse.body.data.scheduledEnd).toISOString(),
      scheduledEnd,
    );

    //************************************************************** */
    // Verify RO summary state

    const repairOrderResponse = await fixture.agent.get(
      `/api/v1/organizations/${fixture.organizationId}/repair-orders/${fixture.repairOrder.id}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "SCHEDULED");

    assert.equal(
      new Date(repairOrderResponse.body.data.scheduledDate).toISOString(),
      scheduledDate,
    );

    assert.equal(
      new Date(repairOrderResponse.body.data.promisedDate).toISOString(),
      promisedDate,
    );

    //************************************************************** */
    // Verify lifecycle history

    const scheduledHistory = repairOrderResponse.body.data.statusHistory.find(
      (history: { status: string; previousStatus: string | null }) =>
        history.status === "SCHEDULED" &&
        history.previousStatus === "READY_TO_WORK",
    );

    assert.notEqual(scheduledHistory, undefined);
  });

  //************************************************************** */

  it("rejects scheduling an RO that is not READY_TO_WORK", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Technician

    const employeeResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: "Invalid",

        lastName: `Technician-${suffix}`,

        role: "TECHNICIAN",

        hourlyRate: 30,

        laborRate: 125,

        isSchedulable: true,

        dailyStartTime: "08:00",

        dailyEndTime: "17:00",

        maxDailyHours: 8,
      });

    assert.equal(employeeResponse.status, 201);

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Invalid",

        lastName: "Schedule",
      });

    assert.equal(customerResponse.status, 201);

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId: customerResponse.body.data.id,

        make: "Honda",

        model: "CRF250R",

        vin: `INVALID-SCHEDULE-${suffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    //************************************************************** */
    // ESTIMATE RO

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId: customerResponse.body.data.id,

        vehicleId: vehicleResponse.body.data.id,
      });

    assert.equal(repairOrderResponse.status, 201);

    //************************************************************** */

    const scheduleResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/scheduling/repair-orders/${repairOrderResponse.body.data.id}`,
      )
      .send({
        technicianEmployeeId: employeeResponse.body.data.id,

        scheduledDate: "2026-09-03T14:00:00.000Z",

        scheduledEnd: "2026-09-03T16:00:00.000Z",
      });

    assert.equal(scheduleResponse.status, 400);

    assert.equal(
      scheduleResponse.body.code,
      "SCHEDULE_REPAIR_ORDER_INVALID_STATUS",
    );
  });

  //************************************************************** */

  it("rejects an inactive or non-schedulable technician", async () => {
    const fixture = await createSchedulingFixture();

    //************************************************************** */
    // Make technician unavailable for scheduling.

    const updateResponse = await fixture.agent
      .patch(
        `/api/v1/organizations/${fixture.organizationId}/employees/${fixture.technician.id}`,
      )
      .send({
        isSchedulable: false,
      });

    assert.equal(updateResponse.status, 200);

    //************************************************************** */

    const scheduleResponse = await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/repair-orders/${fixture.repairOrder.id}`,
      )
      .send({
        technicianEmployeeId: fixture.technician.id,

        scheduledDate: "2026-09-03T14:00:00.000Z",

        scheduledEnd: "2026-09-03T16:00:00.000Z",
      });

    assert.equal(scheduleResponse.status, 400);

    assert.equal(
      scheduleResponse.body.code,
      "SCHEDULE_TECHNICIAN_NOT_SCHEDULABLE",
    );
  });
});

//************************************************************** */
