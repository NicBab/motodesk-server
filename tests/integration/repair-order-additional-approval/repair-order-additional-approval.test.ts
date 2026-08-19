import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order additional-work approval integration", () => {
  it("requests and approves additional work without blocking parts and returns the repair order to IN_PROGRESS", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Request Additional Approval

    const requestResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/request`,
      )
      .send({
        notes: "Customer requested additional labor-only service.",
      });

    assert.equal(requestResponse.status, 200);

    assert.equal(
      requestResponse.body.data.status,
      "WAITING_ON_ADDITIONAL_APPROVAL",
    );

    //************************************************************** */
    // Approve Additional Work

    const approveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/approve`,
      )
      .send({
        approvalMethod: "PHONE",

        approvedBy: "Additional Work Customer",

        approvedAmount: 135,

        notes: "Customer approved additional labor.",
      });

    assert.equal(approveResponse.status, 200);

    assert.equal(approveResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Verify Persisted Status

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Verify Approval Request History

    const requestHistory = repairOrderResponse.body.data.statusHistory.find(
      (history: {
        status: string;
        previousStatus: string | null;
        automatic: boolean;
        notes: string | null;
      }) =>
        history.status === "WAITING_ON_ADDITIONAL_APPROVAL" &&
        history.previousStatus === "IN_PROGRESS" &&
        history.automatic === false,
    );

    assert.notEqual(requestHistory, undefined);

    //************************************************************** */
    // Verify Approval History

    const approvalHistory = repairOrderResponse.body.data.statusHistory.find(
      (history: {
        status: string;
        previousStatus: string | null;
        automatic: boolean;
        notes: string | null;
      }) =>
        history.status === "IN_PROGRESS" &&
        history.previousStatus === "WAITING_ON_ADDITIONAL_APPROVAL" &&
        history.automatic === false,
    );

    assert.notEqual(approvalHistory, undefined);

    assert.equal(approvalHistory?.notes, "Customer approved additional labor.");
  });
});
