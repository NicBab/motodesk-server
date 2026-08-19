import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order additional-work approval decline integration", () => {
  it("returns declined additional work to IN_PROGRESS and preserves the proposed work", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    const suffix = `${Date.now()}-${Math.random()}`;

    //************************************************************** */
    // Add Proposed Additional Labor

    const laborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      )
      .send({
        description: "Proposed additional customer service",

        hours: 1,

        rate: 135,
      });

    assert.equal(laborResponse.status, 201);

    const additionalLaborLineId = laborResponse.body.data.id;

    //************************************************************** */
    // Add Proposed Blocking Part

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partNumber: `DECLINED-ADDITIONAL-${suffix}`,

        description: "Proposed additional-work part",

        quantity: 1,

        unitPrice: 100,

        requiredQty: 1,

        approvedQty: 0,

        estimatedCost: 60,

        status: "NEEDS_REVIEW",

        blocksWork: true,
      });

    assert.equal(partLineResponse.status, 201);

    const additionalPartLineId = partLineResponse.body.data.id;

    //************************************************************** */
    // Request Additional Approval

    const requestResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/request`,
      )
      .send({
        notes: "Customer approval required for proposed additional service.",
      });

    assert.equal(requestResponse.status, 200);

    assert.equal(
      requestResponse.body.data.status,
      "WAITING_ON_ADDITIONAL_APPROVAL",
    );

    //************************************************************** */
    // Decline Additional Work

    const declineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/additional-approval/decline`,
      )
      .send({
        notes: "Customer declined the additional service.",
      });

    assert.equal(declineResponse.status, 200);

    assert.equal(declineResponse.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Proposed Labor Must Still Exist
    //
    // Decline does not silently delete work history.

    const laborLineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${additionalLaborLineId}`,
    );

    assert.equal(laborLineResponse.status, 200);

    assert.equal(laborLineResponse.body.data.id, additionalLaborLineId);

    assert.equal(laborLineResponse.body.data.completed, false);

    //************************************************************** */
    // Proposed Part Must Still Exist

    const persistedPartLineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${additionalPartLineId}`,
    );

    assert.equal(persistedPartLineResponse.status, 200);

    assert.equal(persistedPartLineResponse.body.data.id, additionalPartLineId);

    assert.equal(persistedPartLineResponse.body.data.status, "NEEDS_REVIEW");

    //************************************************************** */
    // Verify Decline History

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "IN_PROGRESS");

    const declineHistory = repairOrderResponse.body.data.statusHistory.find(
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

    assert.notEqual(declineHistory, undefined);

    assert.equal(
      declineHistory?.notes,
      "Customer declined the additional service.",
    );
  });
});
