import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Schedule creation integration", () => {
  it("optionally schedules a READY_TO_WORK repair order and moves it to SCHEDULED", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Schedule",

        lastName: "Customer",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        make: "Yamaha",

        model: "MT-09",

        vin: `SCHEDULE-${uniqueSuffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    //************************************************************** */
    // Repair Order

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,

        complaint: "Scheduling workflow test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Request approval

    const requestApprovalResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
      )
      .send({});

    assert.equal(requestApprovalResponse.status, 200);

    //************************************************************** */
    // Approve
    // RO automatically enters PARTS_REVIEW.

    const approvalResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
      )
      .send({
        approvalMethod: "PHONE",

        approvedBy: "Schedule Customer",

        notes: "Customer approved repair.",
      });

    assert.equal(approvalResponse.status, 200);

    assert.equal(approvalResponse.body.data.status, "PARTS_REVIEW");

    //************************************************************** */
    // No blocking parts.
    // Complete Parts Review → READY_TO_WORK.

    const partsReviewResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
      )
      .send({
        notes: "No blocking parts required.",
      });

    assert.equal(partsReviewResponse.status, 200);

    assert.equal(partsReviewResponse.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Schedule RO

    const scheduledDate = "2026-08-20T14:00:00.000Z";

    const promisedDate = "2026-08-21T22:00:00.000Z";

    const scheduleResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/scheduling/repair-orders/${repairOrderId}`,
      )
      .send({
        scheduledDate,
        promisedDate,

        notes: "Scheduled by service manager.",
      });

    assert.equal(scheduleResponse.status, 200);

    assert.equal(scheduleResponse.body.data.repairOrderId, repairOrderId);

    assert.equal(scheduleResponse.body.data.organizationId, organizationId);

    assert.equal(
      new Date(scheduleResponse.body.data.scheduledDate).toISOString(),
      scheduledDate,
    );

    //************************************************************** */
    // Verify RO moved to SCHEDULED

    const scheduledRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(scheduledRepairOrderResponse.status, 200);

    assert.equal(scheduledRepairOrderResponse.body.data.status, "SCHEDULED");

    assert.equal(
      new Date(
        scheduledRepairOrderResponse.body.data.promisedDate,
      ).toISOString(),
      promisedDate,
    );

    //************************************************************** */
    // Verify status history

    const scheduledHistory =
      scheduledRepairOrderResponse.body.data.statusHistory.find(
        (history: { status: string; previousStatus: string | null }) =>
          history.status === "SCHEDULED" &&
          history.previousStatus === "READY_TO_WORK",
      );

    assert.notEqual(scheduledHistory, undefined);
  });

  //************************************************************** */

  it("rejects scheduling a repair order that is not READY_TO_WORK", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = `${Date.now()}-invalid`;

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Invalid",

        lastName: "Schedule",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        make: "Honda",

        model: "CRF250R",

        vin: `INVALID-SCHEDULE-${uniqueSuffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,
      });

    assert.equal(repairOrderResponse.status, 201);

    // RO is still ESTIMATE.

    const scheduleResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/scheduling/repair-orders/${repairOrderResponse.body.data.id}`,
      )
      .send({
        scheduledDate: "2026-08-20T14:00:00.000Z",
      });

    assert.equal(scheduleResponse.status, 400);

    assert.equal(
      scheduleResponse.body.code,
      "SCHEDULE_REPAIR_ORDER_INVALID_STATUS",
    );
  });
});
