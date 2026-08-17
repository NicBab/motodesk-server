import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Repair Order quality check integration", () => {
  it("begins and passes quality check, moving the repair order to READY_FOR_PICKUP", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "QC",
        lastName: "Pass",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,
        make: "Honda",
        model: "CRF450R",
        vin: `QC-PASS-${uniqueSuffix}`,
        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,
        complaint: "QC pass workflow test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    const changeStatus = async (status: string) =>
      agent
        .post(
          `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
        )
        .send({
          status,
          automatic: false,
        });

    assert.equal((await changeStatus("APPROVED")).status, 200);

    assert.equal((await changeStatus("READY_TO_WORK")).status, 200);

    assert.equal((await changeStatus("IN_PROGRESS")).status, 200);

    assert.equal((await changeStatus("WORK_COMPLETE")).status, 200);

    const beginResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
      )
      .send({
        notes: "Beginning final inspection.",
      });

    assert.equal(beginResponse.status, 200);

    assert.equal(beginResponse.body.data.status, "QUALITY_CHECK");

    const passResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/pass`,
      )
      .send({
        notes: "QC passed.",
      });

    assert.equal(passResponse.status, 200);

    assert.equal(passResponse.body.data.status, "READY_FOR_PICKUP");
  });

  it("fails quality check and returns the repair order to IN_PROGRESS", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = `${Date.now()}-fail`;

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "QC",
        lastName: "Fail",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,
        make: "Yamaha",
        model: "YZ250F",
        vin: `QC-FAIL-${uniqueSuffix}`,
        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,
        complaint: "QC fail workflow test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    const changeStatus = async (status: string) =>
      agent
        .post(
          `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
        )
        .send({
          status,
          automatic: false,
        });

    assert.equal((await changeStatus("APPROVED")).status, 200);

    assert.equal((await changeStatus("READY_TO_WORK")).status, 200);

    assert.equal((await changeStatus("IN_PROGRESS")).status, 200);

    assert.equal((await changeStatus("WORK_COMPLETE")).status, 200);

    const beginResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
      )
      .send({});

    assert.equal(beginResponse.status, 200);

    const failResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/fail`,
      )
      .send({
        notes: "Brake lever still feels soft. Return to technician.",
      });

    assert.equal(failResponse.status, 200);

    assert.equal(failResponse.body.data.status, "IN_PROGRESS");
  });
});
