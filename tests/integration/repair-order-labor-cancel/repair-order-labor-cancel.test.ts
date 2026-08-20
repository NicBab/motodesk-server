import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order labor cancellation integration", () => {
  it("cancels proposed labor, preserves an audit record, and does not block work completion", async () => {
    const { agent, organizationId, repairOrderId, laborLineId, membershipId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Add Proposed Additional Labor

    const proposedLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      )
      .send({
        description: "Customer-declined additional labor",

        hours: 1,

        rate: 135,
      });

    assert.equal(proposedLaborResponse.status, 201);

    assert.equal(proposedLaborResponse.body.data.status, "PROPOSED");

    const proposedLaborLineId = proposedLaborResponse.body.data.id;

    //************************************************************** */
    // Cancel Proposed Labor

    const cancelResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${proposedLaborLineId}/cancel`,
      )
      .send({
        notes: "Customer declined this additional service.",
      });

    assert.equal(cancelResponse.status, 200);

    assert.equal(cancelResponse.body.data.id, proposedLaborLineId);

    assert.equal(cancelResponse.body.data.status, "CANCELLED");

    assert.equal(cancelResponse.body.data.completed, false);

    assert.equal(cancelResponse.body.data.startedAt, null);

    //************************************************************** */
    // Verify Cancellation Audit

    const cancellationRecord =
      await prisma.repairOrderLaborCancellation.findFirst({
        where: {
          organizationId,
          repairOrderId,
          laborLineId: proposedLaborLineId,
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    assert.notEqual(cancellationRecord, null);

    assert.equal(
      cancellationRecord?.reason,
      "Customer declined this additional service.",
    );

    assert.equal(cancellationRecord?.cancelledByMembershipId, membershipId);

    //************************************************************** */
    // Complete Original Active Labor
    //
    // Cancelled proposed labor must not prevent WORK_COMPLETE.

    const completeOriginalLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original approved work completed.",
      });

    assert.equal(completeOriginalLaborResponse.status, 200);

    //************************************************************** */
    // Verify Repair Order Completed

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "WORK_COMPLETE");
  });

  //************************************************************** */

  it("rejects cancelling labor that has already started", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    const cancelResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/cancel`,
      )
      .send({
        notes: "Invalid cancellation attempt.",
      });

    assert.equal(cancelResponse.status, 400);

    assert.equal(
      cancelResponse.body.code,
      "REPAIR_ORDER_LABOR_CANCEL_INVALID_STATUS",
    );
  });
});
