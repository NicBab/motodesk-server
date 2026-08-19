import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order additional-work approval guards integration", () => {
  it("rejects requesting additional approval when the repair order is not IN_PROGRESS", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Complete labor → WORK_COMPLETE

    const completionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original work completed.",
      });

    assert.equal(completionResponse.status, 200);

    //************************************************************** */
    // Request additional approval from wrong status

    const requestResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/request`,
      )
      .send({
        notes: "Invalid additional approval request.",
      });

    assert.equal(requestResponse.status, 400);

    assert.equal(
      requestResponse.body.code,
      "REPAIR_ORDER_ADDITIONAL_APPROVAL_INVALID_STATUS",
    );
  });

  //************************************************************** */

  it("rejects approving additional work when the repair order is not awaiting additional approval", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    const approveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/approve`,
      )
      .send({
        approvalMethod: "PHONE",

        approvedBy: "Invalid Approval Customer",

        notes: "Invalid approval attempt.",
      });

    assert.equal(approveResponse.status, 400);

    assert.equal(
      approveResponse.body.code,
      "REPAIR_ORDER_ADDITIONAL_APPROVAL_APPROVE_INVALID_STATUS",
    );
  });

  //************************************************************** */

  it("rejects declining additional work when the repair order is not awaiting additional approval", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    const declineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/decline`,
      )
      .send({
        notes: "Invalid decline attempt.",
      });

    assert.equal(declineResponse.status, 400);

    assert.equal(
      declineResponse.body.code,
      "REPAIR_ORDER_ADDITIONAL_APPROVAL_DECLINE_INVALID_STATUS",
    );
  });
});
