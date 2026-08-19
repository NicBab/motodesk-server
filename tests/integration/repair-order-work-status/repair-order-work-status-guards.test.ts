import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

import { createInProgressRepairOrderFixture } from "./helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order work-status guards integration", () => {
  it("rejects pausing a repair order that is not in progress", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Invalid",
        lastName: "Pause",
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
        vin: `INVALID-PAUSE-${suffix}`,
        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    //************************************************************** */
    // Repair Order remains ESTIMATE

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId: customerResponse.body.data.id,
        vehicleId: vehicleResponse.body.data.id,
      });

    assert.equal(repairOrderResponse.status, 201);

    const pauseResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-order-work-status/repair-orders/${repairOrderResponse.body.data.id}/pause`,
      )
      .send({
        notes: "Invalid pause attempt.",
      });

    assert.equal(pauseResponse.status, 400);

    assert.equal(pauseResponse.body.code, "REPAIR_ORDER_PAUSE_INVALID_STATUS");
  });

  //************************************************************** */

  it("rejects resuming a repair order that is not paused", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    const resumeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-order-work-status/repair-orders/${repairOrderId}/resume`,
      )
      .send({
        notes: "Invalid resume attempt.",
      });

    assert.equal(resumeResponse.status, 400);

    assert.equal(
      resumeResponse.body.code,
      "REPAIR_ORDER_RESUME_INVALID_STATUS",
    );
  });
});
