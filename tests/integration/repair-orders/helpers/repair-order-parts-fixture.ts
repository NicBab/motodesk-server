import assert from "node:assert/strict";

import { createAuthenticatedAgent } from "../../helpers/authenticated-agent.js";

//************************************************************** */

export async function createPartsReviewFixture(options: {
  qtyOnHand: number;
  suffix: string;
}) {
  const { agent, organizationId } = await createAuthenticatedAgent();

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",

      firstName: "Parts Review",

      lastName: "Customer",
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

      vin: `PARTS-REVIEW-${options.suffix}`,

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

      complaint: "Parts review workflow test.",
    });

  assert.equal(repairOrderResponse.status, 201);

  const repairOrderId = repairOrderResponse.body.data.id;

  //************************************************************** */
  // Request customer approval

  const requestApprovalResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
    )
    .send({
      notes: "Estimate ready for customer approval.",
    });

  assert.equal(requestApprovalResponse.status, 200);

  assert.equal(
    requestApprovalResponse.body.data.status,
    "AWAITING_CUSTOMER_APPROVAL",
  );

  //************************************************************** */
  // Approve
  // Approval automatically hands RO to PARTS_REVIEW.

  const approvalResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
    )
    .send({
      approvalMethod: "PHONE",

      approvedBy: "Parts Review Customer",

      approvedAmount: 500,

      notes: "Customer approved repair.",
    });

  assert.equal(approvalResponse.status, 200);

  assert.equal(approvalResponse.body.data.status, "PARTS_REVIEW");

  //************************************************************** */
  // Catalog Part

  const partNumber = `REVIEW-PART-${options.suffix}`;

  const partResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/parts`)
    .send({
      partNumber,

      description: "Parts review test component",

      qtyOnHand: options.qtyOnHand,

      costPrice: 25,

      sellPrice: 50,
    });

  assert.equal(partResponse.status, 201);

  const partId = partResponse.body.data.id;

  //************************************************************** */
  // Blocking RO Part Line

  const partLineResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
    )
    .send({
      partId,
      partNumber,

      description: "Parts review test component",

      quantity: 1,

      unitPrice: 50,

      requiredQty: 1,

      approvedQty: 1,

      estimatedCost: 25,

      resolutionMethod: "SHOP_INVENTORY",

      blocksWork: true,
    });

  assert.equal(partLineResponse.status, 201);

  const partLineId = partLineResponse.body.data.id;

  return {
    agent,
    organizationId,
    repairOrderId,
    partId,
    partLineId,
  };
}
