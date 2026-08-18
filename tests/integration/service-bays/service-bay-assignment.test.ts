import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

async function createRepairOrderFixture() {
  const { agent, organizationId } = await createAuthenticatedAgent();

  const suffix = `${Date.now()}-${Math.random()}`;

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",
      firstName: "Service",
      lastName: "Bay",
    });

  assert.equal(customerResponse.status, 201);

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId: customerResponse.body.data.id,
      make: "Yamaha",
      model: "MT-09",
      vin: `BAY-ASSIGN-${suffix}`,
      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  //************************************************************** */
  // Repair Order

  const repairOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/repair-orders`)
    .send({
      customerId: customerResponse.body.data.id,
      vehicleId: vehicleResponse.body.data.id,
      complaint: "Service bay assignment test.",
    });

  assert.equal(repairOrderResponse.status, 201);

  return {
    agent,
    organizationId,
    repairOrderId: repairOrderResponse.body.data.id,
  };
}

//************************************************************** */

describe("Service bay assignment integration", () => {
  it("assigns a repair order to an active service bay", async () => {
    const { agent, organizationId, repairOrderId } =
      await createRepairOrderFixture();

    //************************************************************** */
    // Create Bay

    const bayResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/service-bays`)
      .send({
        name: `Assignment Bay ${Date.now()}`,
        description: "Bay used for assignment integration testing.",
      });

    assert.equal(bayResponse.status, 200);

    const serviceBayId = bayResponse.body.data.id;

    //************************************************************** */
    // Assign RO

    const assignmentResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${repairOrderId}/assign`,
      )
      .send({
        serviceBayId,
        notes: "Moved into service bay.",
      });

    assert.equal(assignmentResponse.status, 200);

    assert.equal(assignmentResponse.body.data.organizationId, organizationId);

    assert.equal(assignmentResponse.body.data.repairOrderId, repairOrderId);

    assert.equal(assignmentResponse.body.data.serviceBayId, serviceBayId);

    assert.equal(assignmentResponse.body.data.status, "ACTIVE");

    assert.equal(assignmentResponse.body.data.releasedAt, null);
  });

  //************************************************************** */

  it("rejects assigning the same repair order to another bay while it has an active assignment", async () => {
    const { agent, organizationId, repairOrderId } =
      await createRepairOrderFixture();

    const suffix = Date.now();

    //************************************************************** */
    // Create Two Bays

    const firstBayResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/service-bays`)
      .send({
        name: `First Bay ${suffix}`,
      });

    assert.equal(firstBayResponse.status, 200);

    const secondBayResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/service-bays`)
      .send({
        name: `Second Bay ${suffix}`,
      });

    assert.equal(secondBayResponse.status, 200);

    //************************************************************** */
    // First Assignment

    const firstAssignmentResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${repairOrderId}/assign`,
      )
      .send({
        serviceBayId: firstBayResponse.body.data.id,
      });

    assert.equal(firstAssignmentResponse.status, 200);

    //************************************************************** */
    // Attempt Second Assignment

    const duplicateResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${repairOrderId}/assign`,
      )
      .send({
        serviceBayId: secondBayResponse.body.data.id,
      });

    assert.equal(duplicateResponse.status, 400);

    assert.equal(
      duplicateResponse.body.code,
      "REPAIR_ORDER_SERVICE_BAY_ALREADY_ASSIGNED",
    );
  });
});
