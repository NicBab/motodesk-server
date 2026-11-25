import { defaultShopLocationId } from "../helpers/service-bay-location.fixture.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Repair Order labor workflow integration", () => {
  it("starts labor and automatically moves the repair order to IN_PROGRESS", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Labor",

        lastName: "Workflow",
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

        model: "CRF250R",

        vin: `LABOR-WORKFLOW-${uniqueSuffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    //************************************************************** */
    // Repair Order

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        customerId,
        vehicleId,

        complaint: "Labor workflow integration test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // ESTIMATE → APPROVED

    const approvedResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        status: "APPROVED",

        automatic: false,
      });

    assert.equal(approvedResponse.status, 200);

    //************************************************************** */
    // APPROVED → READY_TO_WORK

    const readyResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        status: "READY_TO_WORK",

        automatic: false,
      });

    assert.equal(readyResponse.status, 200);

    //************************************************************** */
    // Create labor line

    const laborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        description: "Diagnose starting issue",

        hours: 1,

        rate: 135,
      });

    assert.equal(laborResponse.status, 201);

    const laborLineId = laborResponse.body.data.id;

    assert.equal(laborResponse.body.data.startedAt, null);

    //************************************************************** */
    // Start labor

    const startResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/start`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        notes: "Technician began diagnosis.",
      });

    assert.equal(startResponse.status, 200);

    assert.notEqual(startResponse.body.data.startedAt, null);

    assert.equal(startResponse.body.data.completed, false);

    //************************************************************** */
    // RO automatically IN_PROGRESS

    const repairOrderAfterStart = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId));

    assert.equal(repairOrderAfterStart.status, 200);

    assert.equal(repairOrderAfterStart.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Verify automatic status history

    const inProgressHistory =
      repairOrderAfterStart.body.data.statusHistory.find(
        (history: {
          status: string;
          previousStatus: string | null;
          automatic: boolean;
        }) =>
          history.status === "IN_PROGRESS" &&
          history.previousStatus === "READY_TO_WORK" &&
          history.automatic === true,
      );

    assert.notEqual(inProgressHistory, undefined);

    //************************************************************** */
    // Starting twice is blocked

    const duplicateStartResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/start`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({});

    assert.equal(duplicateStartResponse.status, 400);

    assert.equal(
      duplicateStartResponse.body.code,
      "REPAIR_ORDER_LABOR_ALREADY_STARTED",
    );
  });

  //************************************************************** */

  it("keeps the repair order IN_PROGRESS until all labor is completed and then moves it to WORK_COMPLETE", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = `${Date.now()}-complete`;

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Labor",

        lastName: "Completion",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        make: "Yamaha",

        model: "YZ250F",

        vin: `LABOR-COMPLETE-${uniqueSuffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    //************************************************************** */
    // Repair Order

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        customerId,
        vehicleId,

        complaint: "Labor completion workflow test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // ESTIMATE → APPROVED

    const approvedResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        status: "APPROVED",

        automatic: false,
      });

    assert.equal(approvedResponse.status, 200);

    //************************************************************** */
    // APPROVED → READY_TO_WORK

    const readyResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        status: "READY_TO_WORK",

        automatic: false,
      });

    assert.equal(readyResponse.status, 200);

    //************************************************************** */
    // Create first labor line

    const firstLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        description: "Diagnose starting issue",

        hours: 1,

        rate: 135,
      });

    assert.equal(firstLaborResponse.status, 201);

    const firstLaborLineId = firstLaborResponse.body.data.id;

    //************************************************************** */
    // Create second labor line

    const secondLaborResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        description: "Perform repair after diagnosis",

        hours: 2,

        rate: 135,
      });

    assert.equal(secondLaborResponse.status, 201);

    const secondLaborLineId = secondLaborResponse.body.data.id;

    //************************************************************** */
    // Start first labor line
    // This moves RO → IN_PROGRESS

    const firstStartResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${firstLaborLineId}/start`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({});

    assert.equal(firstStartResponse.status, 200);

    //************************************************************** */
    // Start second labor line
    // RO should remain IN_PROGRESS

    const secondStartResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${secondLaborLineId}/start`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({});

    assert.equal(secondStartResponse.status, 200);

    const afterStartingBoth = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId));

    assert.equal(afterStartingBoth.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Complete first labor line

    const firstCompleteResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${firstLaborLineId}/complete`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        notes: "Diagnosis completed.",
      });

    assert.equal(firstCompleteResponse.status, 200);

    assert.equal(firstCompleteResponse.body.data.completed, true);

    assert.notEqual(firstCompleteResponse.body.data.completedAt, null);

    //************************************************************** */
    // RO must remain IN_PROGRESS

    const afterFirstCompletion = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId));

    assert.equal(afterFirstCompletion.body.data.status, "IN_PROGRESS");

    //************************************************************** */
    // Complete final labor line

    const finalCompleteResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${secondLaborLineId}/complete`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({
        notes: "Final repair work completed.",
      });

    assert.equal(finalCompleteResponse.status, 200);

    assert.equal(finalCompleteResponse.body.data.completed, true);

    assert.notEqual(finalCompleteResponse.body.data.completedAt, null);

    //************************************************************** */
    // RO automatically becomes WORK_COMPLETE

    const afterFinalCompletion = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId));

    assert.equal(afterFinalCompletion.status, 200);

    assert.equal(afterFinalCompletion.body.data.status, "WORK_COMPLETE");

    //************************************************************** */
    // Verify automatic WORK_COMPLETE history

    const workCompleteHistory =
      afterFinalCompletion.body.data.statusHistory.find(
        (history: {
          status: string;
          previousStatus: string | null;
          automatic: boolean;
        }) =>
          history.status === "WORK_COMPLETE" &&
          history.previousStatus === "IN_PROGRESS" &&
          history.automatic === true,
      );

    assert.notEqual(workCompleteHistory, undefined);

    //************************************************************** */
    // Reject duplicate completion

    const duplicateCompleteResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${secondLaborLineId}/complete`,
      ).set("X-Shop-Location-Id", await defaultShopLocationId(organizationId))
      .send({});

    assert.equal(duplicateCompleteResponse.status, 400);

    assert.equal(
      duplicateCompleteResponse.body.code,
      "REPAIR_ORDER_LABOR_ALREADY_COMPLETED",
    );
  });
});
