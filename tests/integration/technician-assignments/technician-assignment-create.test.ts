import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Technician assignment creation integration", () => {
  it("assigns an eligible membership to a repair order and updates the primary technician", async () => {
    const { agent, organizationId, membershipId } =
      await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Technician",

        lastName: "Assignment",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        make: "Kawasaki",

        model: "ZX-6R",

        vin: `TECH-ASSIGN-${uniqueSuffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    //************************************************************** */
    // Repair Order

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,

        complaint: "Technician assignment integration test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Assign Technician

    const assignmentResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderId}`,
      )
      .send({
        technicianMembershipId: membershipId,

        notes: "Assigned primary technician.",
      });

    assert.equal(assignmentResponse.status, 200);

    assert.equal(assignmentResponse.body.data.organizationId, organizationId);

    assert.equal(assignmentResponse.body.data.repairOrderId, repairOrderId);

    assert.equal(
      assignmentResponse.body.data.technicianMembershipId,
      membershipId,
    );

    assert.equal(assignmentResponse.body.data.status, "ACTIVE");

    //************************************************************** */
    // Verify RO Primary Technician

    const updatedRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(updatedRepairOrderResponse.status, 200);

    assert.equal(
      updatedRepairOrderResponse.body.data.primaryTechnicianMembershipId,
      membershipId,
    );

    //************************************************************** */
    // Reject Duplicate Active Assignment

    const duplicateResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderId}`,
      )
      .send({
        technicianMembershipId: membershipId,

        notes: "Duplicate assignment attempt.",
      });

    assert.equal(duplicateResponse.status, 400);

    assert.equal(
      duplicateResponse.body.code,
      "TECHNICIAN_ASSIGNMENT_ALREADY_ACTIVE",
    );
  });
});
