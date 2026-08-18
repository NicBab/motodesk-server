import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Technician assignment removal integration", () => {
  it("removes an active technician assignment and clears the repair order primary technician", async () => {
    const { agent, organizationId, membershipId } =
      await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Remove",
        lastName: "Assignment",
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
        vin: `TECH-REMOVE-${suffix}`,
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
        complaint: "Technician assignment removal test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Initial Assignment

    const assignmentResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderId}`,
      )
      .send({
        technicianMembershipId: membershipId,
        notes: "Initial assignment.",
      });

    assert.equal(assignmentResponse.status, 200);

    const assignmentId = assignmentResponse.body.data.id;

    //************************************************************** */
    // Remove Assignment

    const removeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderId}/remove`,
      )
      .send({
        notes: "Technician removed from repair order.",
      });

    assert.equal(removeResponse.status, 200);

    assert.equal(removeResponse.body.data.id, assignmentId);

    assert.equal(removeResponse.body.data.status, "REMOVED");

    assert.notEqual(removeResponse.body.data.endedAt, null);

    assert.equal(
      removeResponse.body.data.notes,
      "Technician removed from repair order.",
    );

    //************************************************************** */
    // Verify RO Primary Technician Cleared

    const updatedRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(updatedRepairOrderResponse.status, 200);

    assert.equal(
      updatedRepairOrderResponse.body.data.primaryTechnicianMembershipId,
      null,
    );
  });

  //************************************************************** */

  it("rejects removal when no active technician assignment exists", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = `${Date.now()}-invalid`;

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Invalid",
        lastName: "Removal",
      });

    assert.equal(customerResponse.status, 201);

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId: customerResponse.body.data.id,
        make: "Yamaha",
        model: "YZ250F",
        vin: `INVALID-TECH-REMOVE-${suffix}`,
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
      });

    assert.equal(repairOrderResponse.status, 201);

    //************************************************************** */
    // Attempt Removal Without Assignment

    const removeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderResponse.body.data.id}/remove`,
      )
      .send({
        notes: "Invalid removal attempt.",
      });

    assert.equal(removeResponse.status, 400);

    assert.equal(
      removeResponse.body.code,
      "TECHNICIAN_ASSIGNMENT_REMOVE_NO_ACTIVE_ASSIGNMENT",
    );
  });
});
