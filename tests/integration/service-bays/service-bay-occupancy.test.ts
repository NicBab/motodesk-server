import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

async function createRepairOrderFixture(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
) {
  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",

      firstName: "Bay",

      lastName: `Occupancy ${suffix}`,
    });

  assert.equal(customerResponse.status, 201);

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId: customerResponse.body.data.id,

      make: "Honda",

      model: "CRF450R",

      vin: `BAY-OCCUPANCY-${suffix}`,

      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  const repairOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/repair-orders`)
    .send({
      customerId: customerResponse.body.data.id,

      vehicleId: vehicleResponse.body.data.id,

      complaint: "Service bay occupancy integration test.",
    });

  assert.equal(repairOrderResponse.status, 201);

  return repairOrderResponse.body.data.id;
}

//************************************************************** */

describe("Service bay occupancy integration", () => {
  it("rejects assigning another repair order to an occupied service bay", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Create Service Bay

    const bayResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/service-bays`)
      .send({
        name: `Occupancy Bay ${suffix}`,
      });

    assert.equal(bayResponse.status, 200);

    const serviceBayId = bayResponse.body.data.id;

    //************************************************************** */
    // Create Two Repair Orders

    const firstRepairOrderId = await createRepairOrderFixture(
      agent,
      organizationId,
      `${suffix}-1`,
    );

    const secondRepairOrderId = await createRepairOrderFixture(
      agent,
      organizationId,
      `${suffix}-2`,
    );

    //************************************************************** */
    // Assign First Repair Order

    const firstAssignmentResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${firstRepairOrderId}/assign`,
      )
      .send({
        serviceBayId,

        notes: "First repair order occupies bay.",
      });

    assert.equal(firstAssignmentResponse.status, 200);

    //************************************************************** */
    // Attempt Second Repair Order In Same Bay

    const secondAssignmentResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${secondRepairOrderId}/assign`,
      )
      .send({
        serviceBayId,

        notes: "Attempt duplicate bay occupancy.",
      });

    assert.equal(secondAssignmentResponse.status, 400);

    assert.equal(
      secondAssignmentResponse.body.code,
      "SERVICE_BAY_ALREADY_OCCUPIED",
    );
  });
});
