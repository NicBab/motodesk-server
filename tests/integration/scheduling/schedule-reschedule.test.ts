import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

async function createScheduledRepairOrder() {
  const { agent, organizationId } = await createAuthenticatedAgent();

  const uniqueSuffix = Date.now().toString();

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",
      firstName: "Reschedule",
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
      model: "YZ450F",
      vin: `RESCHEDULE-${uniqueSuffix}`,
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
      complaint: "Rescheduling integration test.",
    });

  assert.equal(repairOrderResponse.status, 201);

  const repairOrderId = repairOrderResponse.body.data.id;

  //************************************************************** */
  // Request Approval

  const requestApprovalResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
    )
    .send({});

  assert.equal(requestApprovalResponse.status, 200);

  //************************************************************** */
  // Approve
  // Automatically enters PARTS_REVIEW.

  const approvalResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
    )
    .send({
      approvalMethod: "PHONE",
      approvedBy: "Reschedule Customer",
    });

  assert.equal(approvalResponse.status, 200);

  assert.equal(approvalResponse.body.data.status, "PARTS_REVIEW");

  //************************************************************** */
  // Complete Parts Review
  // No blocking parts → READY_TO_WORK.

  const partsReviewResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
    )
    .send({});

  assert.equal(partsReviewResponse.status, 200);

  assert.equal(partsReviewResponse.body.data.status, "READY_TO_WORK");

  //************************************************************** */
  // Initial Schedule

  const initialScheduledDate = "2026-08-20T14:00:00.000Z";

  const initialScheduleResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/scheduling/repair-orders/${repairOrderId}`,
    )
    .send({
      scheduledDate: initialScheduledDate,
      notes: "Initial schedule.",
    });

  assert.equal(initialScheduleResponse.status, 200);

  return {
    agent,
    organizationId,
    repairOrderId,
    initialSchedule: initialScheduleResponse.body.data,
  };
}

//************************************************************** */

describe("Schedule rescheduling integration", () => {
  it("reschedules a scheduled repair order while preserving schedule history", async () => {
    const { agent, organizationId, repairOrderId, initialSchedule } =
      await createScheduledRepairOrder();

    const newScheduledDate = "2026-08-22T16:30:00.000Z";

    const promisedDate = "2026-08-23T22:00:00.000Z";

    //************************************************************** */
    // Reschedule

    const rescheduleResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/scheduling/repair-orders/${repairOrderId}/reschedule`,
      )
      .send({
        scheduledDate: newScheduledDate,
        promisedDate,
        notes: "Customer requested a later appointment.",
      });

    assert.equal(rescheduleResponse.status, 200);

    assert.equal(rescheduleResponse.body.data.repairOrderId, repairOrderId);

    assert.notEqual(rescheduleResponse.body.data.id, initialSchedule.id);

    assert.equal(
      new Date(rescheduleResponse.body.data.scheduledDate).toISOString(),
      newScheduledDate,
    );

    //************************************************************** */
    // RO remains SCHEDULED

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "SCHEDULED");

    assert.equal(
      new Date(repairOrderResponse.body.data.promisedDate).toISOString(),
      promisedDate,
    );
  });

  //************************************************************** */

  it("rejects rescheduling a repair order that is not currently scheduled", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = `${Date.now()}-invalid`;

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Invalid",
        lastName: "Reschedule",
      });

    assert.equal(customerResponse.status, 201);

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId: customerResponse.body.data.id,
        make: "Honda",
        model: "CRF450R",
        vin: `INVALID-RESCHEDULE-${uniqueSuffix}`,
        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId: customerResponse.body.data.id,
        vehicleId: vehicleResponse.body.data.id,
      });

    assert.equal(repairOrderResponse.status, 201);

    //************************************************************** */
    // RO is still ESTIMATE.

    const rescheduleResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/scheduling/repair-orders/${repairOrderResponse.body.data.id}/reschedule`,
      )
      .send({
        scheduledDate: "2026-08-22T16:30:00.000Z",
      });

    assert.equal(rescheduleResponse.status, 400);

    assert.equal(
      rescheduleResponse.body.code,
      "RESCHEDULE_REPAIR_ORDER_INVALID_STATUS",
    );
  });
});
