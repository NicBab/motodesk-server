import assert from "node:assert/strict";

import { createAuthenticatedAgent } from "../../helpers/authenticated-agent.js";

//************************************************************** */

export async function createInProgressRepairOrderFixture() {
  const { agent, organizationId, membershipId } =
    await createAuthenticatedAgent();

  const suffix = `${Date.now()}-${Math.random()}`;

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",

      firstName: "Work",

      lastName: "Status",
    });

  assert.equal(customerResponse.status, 201);

  const customerId = customerResponse.body.data.id;

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId,

      make: "Honda",

      model: "CRF450R",

      vin: `WORK-STATUS-${suffix}`,

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

      complaint: "Repair order work-status integration fixture.",
    });

  assert.equal(repairOrderResponse.status, 201);

  const repairOrderId = repairOrderResponse.body.data.id;

  //************************************************************** */
  // Request Approval

  const requestApprovalResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
    )
    .send({});

  assert.equal(requestApprovalResponse.status, 200);

  //************************************************************** */
  // Approve
  // Automatically enters PARTS_REVIEW.

  const approvalResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
    )
    .send({
      approvalMethod: "PHONE",

      approvedBy: "Work Status Customer",

      notes: "Customer approved work.",
    });

  assert.equal(approvalResponse.status, 200);

  assert.equal(approvalResponse.body.data.status, "PARTS_REVIEW");

  //************************************************************** */
  // Complete Parts Review
  // No blocking parts → READY_TO_WORK.

  const partsReviewResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
    )
    .send({
      notes: "No blocking parts required.",
    });

  assert.equal(partsReviewResponse.status, 200);

  assert.equal(partsReviewResponse.body.data.status, "READY_TO_WORK");

  //************************************************************** */
  // Create Labor Line

  const laborResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
    )
    .send({
      description: "Work-status integration labor",

      hours: 1,

      rate: 135,
    });

  assert.equal(laborResponse.status, 201);

  const laborLineId = laborResponse.body.data.id;

  //************************************************************** */
  // Start Labor
  // Automatically moves RO → IN_PROGRESS.

  const startLaborResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/start`,
    )
    .send({
      notes: "Technician began work.",
    });

  assert.equal(startLaborResponse.status, 200);

  //************************************************************** */
  // Verify IN_PROGRESS

  const inProgressResponse = await agent.get(
    `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
  );

  assert.equal(inProgressResponse.status, 200);

  assert.equal(inProgressResponse.body.data.status, "IN_PROGRESS");

  return {
    agent,
    organizationId,
    membershipId,
    repairOrderId,
    laborLineId,
  };
}
