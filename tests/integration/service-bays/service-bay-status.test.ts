import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Service bay status integration", () => {
  it("moves an unoccupied service bay through maintenance and back to active", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Create Bay

    const bayResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/service-bays`)
      .send({
        name: `Status Bay ${suffix}`,
      });

    assert.equal(bayResponse.status, 200);

    const serviceBayId = bayResponse.body.data.id;

    //************************************************************** */
    // Move To Maintenance

    const maintenanceResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/${serviceBayId}/status`,
      )
      .send({
        status: "MAINTENANCE",
        notes: "Lift inspection.",
      });

    assert.equal(maintenanceResponse.status, 200);

    assert.equal(maintenanceResponse.body.data.status, "MAINTENANCE");

    //************************************************************** */
    // Return To Active

    const activeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/${serviceBayId}/status`,
      )
      .send({
        status: "ACTIVE",
      });

    assert.equal(activeResponse.status, 200);

    assert.equal(activeResponse.body.data.status, "ACTIVE");
  });

  //************************************************************** */

  it("rejects placing an occupied service bay into maintenance", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Create Bay

    const bayResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/service-bays`)
      .send({
        name: `Occupied Status Bay ${suffix}`,
      });

    assert.equal(bayResponse.status, 200);

    const serviceBayId = bayResponse.body.data.id;

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Occupied",
        lastName: "Bay",
      });

    assert.equal(customerResponse.status, 201);

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId: customerResponse.body.data.id,
        make: "Honda",
        model: "CBR600RR",
        vin: `BAY-STATUS-${suffix}`,
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
        complaint: "Occupied bay status test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Occupy Bay

    const assignmentResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/repair-orders/${repairOrderId}/assign`,
      )
      .send({
        serviceBayId,
      });

    assert.equal(assignmentResponse.status, 200);

    //************************************************************** */
    // Attempt Maintenance

    const statusResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/service-bays/${serviceBayId}/status`,
      )
      .send({
        status: "MAINTENANCE",
      });

    assert.equal(statusResponse.status, 400);

    assert.equal(statusResponse.body.code, "SERVICE_BAY_STATUS_OCCUPIED");
  });
});
