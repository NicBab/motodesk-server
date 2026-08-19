import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order additional-work closure integration", () => {
  it("requires reopened additional work to complete the full QC, cashier, pickup, and close lifecycle", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Complete Original Work → WORK_COMPLETE

    const originalCompletionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original work completed.",
      });

    assert.equal(originalCompletionResponse.status, 200);

    //************************************************************** */
    // Reopen For Additional Work → IN_PROGRESS

    const reopenResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/reopen`,
      )
      .send({
        notes: "Customer requested additional service.",
      });

    assert.equal(reopenResponse.status, 200);

    assert.equal(reopenResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Add Additional Labor

    const additionalLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      )
      .send({
        description: "Customer-requested additional service",

        hours: 1,

        rate: 135,
      });

    assert.equal(additionalLaborResponse.status, 201);

    const additionalLaborLineId = additionalLaborResponse.body.data.id;

    //************************************************************** */
    // Start Additional Labor

    const startLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${additionalLaborLineId}/start`,
      )
      .send({
        notes: "Additional service started.",
      });

    assert.equal(startLaborResponse.status, 200);

    //************************************************************** */
    // Complete Additional Labor → WORK_COMPLETE

    const completeAdditionalLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${additionalLaborLineId}/complete`,
      )
      .send({
        notes: "Additional service completed.",
      });

    assert.equal(completeAdditionalLaborResponse.status, 200);

    const afterAdditionalWorkResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(afterAdditionalWorkResponse.status, 200);

    assert.equal(afterAdditionalWorkResponse.body.data.status, "WORK_COMPLETE");

    //************************************************************** */
    // Must Begin QC

    const beginQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
      )
      .send({
        notes: "Beginning QC after additional work.",
      });

    assert.equal(beginQcResponse.status, 200);

    assert.equal(beginQcResponse.body.data.status, "QUALITY_CHECK");

    //************************************************************** */
    // Pass QC → READY_FOR_PICKUP

    const passQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/pass`,
      )
      .send({
        notes: "Additional work passed QC.",
      });

    assert.equal(passQcResponse.status, 200);

    assert.equal(passQcResponse.body.data.status, "READY_FOR_PICKUP");

    //************************************************************** */
    // Cashier

    const cashierResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/cashier`,
      )
      .send({
        notes: "Final repair order cashiered.",
      });

    assert.equal(cashierResponse.status, 200);

    assert.equal(cashierResponse.body.data.status, "CASHIERED");

    //************************************************************** */
    // Pickup

    const pickupResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/pickup`,
      )
      .send({
        notes: "Customer picked up vehicle.",
      });

    assert.equal(pickupResponse.status, 200);

    assert.equal(pickupResponse.body.data.status, "PICKED_UP");

    //************************************************************** */
    // Close

    const closeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/close`,
      )
      .send({
        notes: "Repair order closed after additional work.",
      });

    assert.equal(closeResponse.status, 200);

    assert.equal(closeResponse.body.data.status, "CLOSED");

    //************************************************************** */
    // Verify Final Persisted State

    const finalRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalRepairOrderResponse.status, 200);

    assert.equal(finalRepairOrderResponse.body.data.status, "CLOSED");

    //************************************************************** */
    // Verify Tail-End Status History

    const statuses = finalRepairOrderResponse.body.data.statusHistory.map(
      (history: { status: string }) => history.status,
    );

    assert.equal(statuses.includes("WORK_COMPLETE"), true);

    assert.equal(statuses.includes("QUALITY_CHECK"), true);

    assert.equal(statuses.includes("READY_FOR_PICKUP"), true);

    assert.equal(statuses.includes("CASHIERED"), true);

    assert.equal(statuses.includes("PICKED_UP"), true);

    assert.equal(statuses.includes("CLOSED"), true);
  });
});
