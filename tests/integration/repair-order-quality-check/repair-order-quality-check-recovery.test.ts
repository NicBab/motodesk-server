import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order quality-check recovery integration", () => {
  it("returns failed QC work to IN_PROGRESS and allows corrective labor before passing QC", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Complete Original Labor → WORK_COMPLETE

    const originalCompletionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Original repair work completed.",
      });

    assert.equal(originalCompletionResponse.status, 200);

    //************************************************************** */
    // Begin QC

    const beginQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
      )
      .send({
        notes: "Beginning initial quality check.",
      });

    assert.equal(beginQcResponse.status, 200);

    assert.equal(beginQcResponse.body.data.status, "QUALITY_CHECK");

    //************************************************************** */
    // Fail QC → IN_PROGRESS

    const failQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/fail`,
      )
      .send({
        notes: "Brake lever still feels soft.",
      });

    assert.equal(failQcResponse.status, 200);

    assert.equal(failQcResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Original Completed Labor Must Stay Completed

    const originalLaborResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}`,
    );

    assert.equal(originalLaborResponse.status, 200);

    assert.equal(originalLaborResponse.body.data.completed, true);

    //************************************************************** */
    // Add Corrective Labor

    const correctiveLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      )
      .send({
        description: "Correct brake hydraulic issue found during QC",

        hours: 0.5,

        rate: 135,
      });

    assert.equal(correctiveLaborResponse.status, 201);

    const correctiveLaborLineId = correctiveLaborResponse.body.data.id;

    //************************************************************** */
    // Start Corrective Labor

    const startCorrectiveLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${correctiveLaborLineId}/start`,
      )
      .send({
        notes: "Beginning QC corrective work.",
      });

    assert.equal(startCorrectiveLaborResponse.status, 200);

    //************************************************************** */
    // Complete Corrective Labor → WORK_COMPLETE

    const completeCorrectiveLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${correctiveLaborLineId}/complete`,
      )
      .send({
        notes: "Corrective work completed.",
      });

    assert.equal(completeCorrectiveLaborResponse.status, 200);

    const afterCorrectionResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(afterCorrectionResponse.status, 200);

    assert.equal(afterCorrectionResponse.body.data.status, "WORK_COMPLETE");

    //************************************************************** */
    // Begin QC Again

    const secondBeginQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
      )
      .send({
        notes: "Beginning follow-up quality check.",
      });

    assert.equal(secondBeginQcResponse.status, 200);

    assert.equal(secondBeginQcResponse.body.data.status, "QUALITY_CHECK");

    //************************************************************** */
    // Pass QC → READY_FOR_PICKUP

    const passQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/pass`,
      )
      .send({
        notes: "Corrective work verified. QC passed.",
      });

    assert.equal(passQcResponse.status, 200);

    assert.equal(passQcResponse.body.data.status, "READY_FOR_PICKUP");

    //************************************************************** */
    // Verify Full Recovery History

    const finalRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalRepairOrderResponse.status, 200);

    const history = finalRepairOrderResponse.body.data.statusHistory;

    const failedQcHistory = history.find(
      (item: { status: string; previousStatus: string | null }) =>
        item.status === "IN_PROGRESS" &&
        item.previousStatus === "QUALITY_CHECK",
    );

    assert.notEqual(failedQcHistory, undefined);

    const finalPickupHistory = history.find(
      (item: { status: string; previousStatus: string | null }) =>
        item.status === "READY_FOR_PICKUP" &&
        item.previousStatus === "QUALITY_CHECK",
    );

    assert.notEqual(finalPickupHistory, undefined);
  });
});
