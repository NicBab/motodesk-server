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

      lastName: `Release ${suffix}`,
    });

  assert.equal(customerResponse.status, 201);

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId: customerResponse.body.data.id,

      make: "Kawasaki",

      model: "KX450",

      vin: `BAY-RELEASE-${suffix}`,

      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  const repairOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/repair-orders`)
    .send({
      customerId: customerResponse.body.data.id,

      vehicleId: vehicleResponse.body.data.id,

      complaint: "Service bay release integration test.",
    });

  assert.equal(repairOrderResponse.status, 201);

  return repairOrderResponse.body.data.id;
}

//************************************************************** */

describe("Service bay release integration", () => {
  it("releases an active service bay assignment and allows the bay to be reused", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Create Bay

    const bayResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/service-bays`)
      .send({
        name: `Release Bay ${suffix}`,
      });

    assert.equal(bayResponse.status, 200);

    const serviceBayId = bayResponse.body.data.id;

    //************************************************************** */
    // Create First RO

    const firstRepairOrderId = await createRepairOrderFixture(
      agent,
      organizationId,
      `${suffix}-1`,
    );

    //************************************************************** */
    // Assign First RO

    const assignmentResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${firstRepairOrderId}/assign`,
      )
      .send({
        serviceBayId,

        notes: "First repair order assigned.",
      });

    assert.equal(assignmentResponse.status, 200);

    const assignmentId = assignmentResponse.body.data.id;

    //************************************************************** */
    // Capture RO Status Before Release

    const beforeReleaseResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${firstRepairOrderId}`,
    );

    assert.equal(beforeReleaseResponse.status, 200);

    const repairOrderStatusBeforeRelease =
      beforeReleaseResponse.body.data.status;

    //************************************************************** */
    // Release Bay

    const releaseResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${firstRepairOrderId}/release`,
      )
      .send({
        notes: "Unit moved out of service bay.",
      });

    assert.equal(releaseResponse.status, 200);

    assert.equal(releaseResponse.body.data.id, assignmentId);

    assert.equal(releaseResponse.body.data.status, "RELEASED");

    assert.notEqual(releaseResponse.body.data.releasedAt, null);

    assert.equal(
      releaseResponse.body.data.notes,
      "Unit moved out of service bay.",
    );

    //************************************************************** */
    // Verify RO Status Was Not Changed

    const afterReleaseResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${firstRepairOrderId}`,
    );

    assert.equal(afterReleaseResponse.status, 200);

    assert.equal(
      afterReleaseResponse.body.data.status,
      repairOrderStatusBeforeRelease,
    );

    //************************************************************** */
    // Create Second RO

    const secondRepairOrderId = await createRepairOrderFixture(
      agent,
      organizationId,
      `${suffix}-2`,
    );

    //************************************************************** */
    // Reuse Released Bay

    const secondAssignmentResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${secondRepairOrderId}/assign`,
      )
      .send({
        serviceBayId,

        notes: "Released bay reused by second repair order.",
      });

    assert.equal(secondAssignmentResponse.status, 200);

    assert.equal(secondAssignmentResponse.body.data.serviceBayId, serviceBayId);

    assert.equal(
      secondAssignmentResponse.body.data.repairOrderId,
      secondRepairOrderId,
    );

    assert.equal(secondAssignmentResponse.body.data.status, "ACTIVE");
  });

  //************************************************************** */

  it("rejects release when the repair order has no active bay assignment", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const repairOrderId = await createRepairOrderFixture(
      agent,
      organizationId,
      `${Date.now()}-invalid`,
    );

    const releaseResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${repairOrderId}/release`,
      )
      .send({
        notes: "Invalid release attempt.",
      });

    assert.equal(releaseResponse.status, 400);

    assert.equal(
      releaseResponse.body.code,
      "SERVICE_BAY_RELEASE_NO_ACTIVE_ASSIGNMENT",
    );
  });
});
