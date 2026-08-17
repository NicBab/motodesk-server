import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Repair Order workflow integration", () => {
  it("follows the valid service-bay workflow and rejects an invalid status jump", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Workflow",
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
        vin: `WORKFLOW-VIN-${uniqueSuffix}`,
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
        complaint: "Repair order workflow integration test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    assert.equal(repairOrderResponse.body.data.status, "ESTIMATE");

    //************************************************************** */
    // Helper

    async function changeStatus(status: string) {
      return agent
        .post(
          `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
        )
        .send({
          status,
          notes: `Workflow transition to ${status}.`,
          automatic: false,
        });
    }

    //************************************************************** */
    // ESTIMATE → APPROVED

    const approvedResponse = await changeStatus("APPROVED");

    assert.equal(approvedResponse.status, 200);

    assert.equal(approvedResponse.body.data.status, "APPROVED");

    //************************************************************** */
    // APPROVED → READY_TO_WORK

    const readyResponse = await changeStatus("READY_TO_WORK");

    assert.equal(readyResponse.status, 200);

    assert.equal(readyResponse.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Reject READY_TO_WORK → QUALITY_CHECK

    const invalidJumpResponse = await changeStatus("QUALITY_CHECK");

    assert.equal(invalidJumpResponse.status, 400);

    assert.equal(
      invalidJumpResponse.body.code,
      "REPAIR_ORDER_STATUS_TRANSITION_INVALID",
    );

    //************************************************************** */
    // Confirm failed transition did not mutate status

    const afterInvalidJump = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(afterInvalidJump.status, 200);

    assert.equal(afterInvalidJump.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // READY_TO_WORK → SCHEDULED

    const scheduledResponse = await changeStatus("SCHEDULED");

    assert.equal(scheduledResponse.status, 200);

    assert.equal(scheduledResponse.body.data.status, "SCHEDULED");

    //************************************************************** */
    // SCHEDULED → IN_PROGRESS

    const inProgressResponse = await changeStatus("IN_PROGRESS");

    assert.equal(inProgressResponse.status, 200);

    assert.equal(inProgressResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // IN_PROGRESS → PAUSED

    const pausedResponse = await changeStatus("PAUSED");

    assert.equal(pausedResponse.status, 200);

    assert.equal(pausedResponse.body.data.status, "PAUSED");

    //************************************************************** */
    // PAUSED → IN_PROGRESS

    const resumedResponse = await changeStatus("IN_PROGRESS");

    assert.equal(resumedResponse.status, 200);

    assert.equal(resumedResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // IN_PROGRESS → WORK_COMPLETE

    const workCompleteResponse = await changeStatus("WORK_COMPLETE");

    assert.equal(workCompleteResponse.status, 200);

    assert.equal(workCompleteResponse.body.data.status, "WORK_COMPLETE");

    //************************************************************** */
    // WORK_COMPLETE → QUALITY_CHECK

    const qualityCheckResponse = await changeStatus("QUALITY_CHECK");

    assert.equal(qualityCheckResponse.status, 200);

    assert.equal(qualityCheckResponse.body.data.status, "QUALITY_CHECK");

    //************************************************************** */
    // QUALITY_CHECK → READY_FOR_PICKUP

    const readyForPickupResponse = await changeStatus("READY_FOR_PICKUP");

    assert.equal(readyForPickupResponse.status, 200);

    assert.equal(readyForPickupResponse.body.data.status, "READY_FOR_PICKUP");

    //************************************************************** */
    // Verify status history

    const finalRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalRepairOrderResponse.status, 200);

    const history = finalRepairOrderResponse.body.data.statusHistory;

    const statuses = history.map((entry: { status: string }) => entry.status);

    assert.equal(statuses.includes("APPROVED"), true);

    assert.equal(statuses.includes("READY_TO_WORK"), true);

    assert.equal(statuses.includes("SCHEDULED"), true);

    assert.equal(statuses.includes("IN_PROGRESS"), true);

    assert.equal(statuses.includes("PAUSED"), true);

    assert.equal(statuses.includes("WORK_COMPLETE"), true);

    assert.equal(statuses.includes("QUALITY_CHECK"), true);

    assert.equal(statuses.includes("READY_FOR_PICKUP"), true);
  });
});
