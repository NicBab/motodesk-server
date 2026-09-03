import assert from "node:assert/strict";

import {
  createAuthenticatedAgent,
} from "../../helpers/authenticated-agent.js";

import {
  randomUUID,
} from "node:crypto";

//************************************************************** */

export async function createSchedulingFixture() {
  const {
    agent,
    organizationId,
  } =
    await createAuthenticatedAgent();

const suffix =
  randomUUID();

  //************************************************************** */
  // Technician

  const employeeResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/employees`,
      )
      .send({
        firstName:
          "Scheduling",

        lastName:
          `Technician-${suffix}`,

        role:
          "TECHNICIAN",

        hourlyRate:
          30,

        laborRate:
          125,

        isSchedulable:
          true,

        dailyStartTime:
          "08:00",

        dailyEndTime:
          "17:00",

        maxDailyHours:
          8,
      });

  assert.equal(
    employeeResponse.status,
    201,
  );

  const technician =
    employeeResponse.body.data;

  //************************************************************** */
  // Customer

  const customerResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/customers`,
      )
      .send({
        type:
          "INDIVIDUAL",

        firstName:
          "Scheduling",

        lastName:
          `Customer-${suffix}`,
      });

  assert.equal(
    customerResponse.status,
    201,
  );

  const customer =
    customerResponse.body.data;

  //************************************************************** */
  // Vehicle

  const vehicleResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/vehicles`,
      )
      .send({
        customerId:
          customer.id,

        make:
          "Yamaha",

        model:
          "MT-09",

        vin:
          `SCHEDULING-${suffix}`,

        type:
          "MOTORCYCLE",
      });

  assert.equal(
    vehicleResponse.status,
    201,
  );

  const vehicle =
    vehicleResponse.body.data;

  //************************************************************** */
  // Repair Order

  const repairOrderResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders`,
      )
      .send({
        customerId:
          customer.id,

        vehicleId:
          vehicle.id,

        complaint:
          "Scheduling integration fixture.",
      });

  assert.equal(
    repairOrderResponse.status,
    201,
  );

  const repairOrder =
    repairOrderResponse.body.data;

  //************************************************************** */
  // Approval Request

  const requestApprovalResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrder.id}/approval/request`,
      )
      .send({});

  assert.equal(
    requestApprovalResponse.status,
    200,
  );

  //************************************************************** */
  // Approval

  const approvalResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrder.id}/approval/approve`,
      )
      .send({
        approvalMethod:
          "PHONE",

        approvedBy:
          "Scheduling Customer",
      });

  assert.equal(
    approvalResponse.status,
    200,
  );

  assert.equal(
    approvalResponse.body.data.status,
    "PARTS_REVIEW",
  );

  //************************************************************** */
  // Parts Review -> READY_TO_WORK

  const partsReviewResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrder.id}/parts-review/complete`,
      )
      .send({});

  assert.equal(
    partsReviewResponse.status,
    200,
  );

  assert.equal(
    partsReviewResponse.body.data.status,
    "READY_TO_WORK",
  );

  //************************************************************** */

  return {
    agent,
    organizationId,

    technician,

    customer,

    vehicle,

    repairOrder:
      partsReviewResponse.body.data,
  };
}

//************************************************************** */

export async function scheduleFixtureRepairOrder(
  fixture:
    Awaited<
      ReturnType<
        typeof createSchedulingFixture
      >
    >,
  overrides?: {
    scheduledDate?: string;
    scheduledEnd?: string;
    promisedDate?: string;
    notes?: string;
  },
) {
  const scheduledDate =
    overrides?.scheduledDate ??
    "2026-09-03T14:00:00.000Z";

  const scheduledEnd =
    overrides?.scheduledEnd ??
    "2026-09-03T16:00:00.000Z";

  const response =
    await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/repair-orders/${fixture.repairOrder.id}`,
      )
      .send({
        technicianEmployeeId:
          fixture.technician.id,

        scheduledDate,

        scheduledEnd,

        promisedDate:
          overrides?.promisedDate,

        notes:
          overrides?.notes ??
          "Scheduled by integration test.",
      });

  assert.equal(
    response.status,
    200,
  );

  return response.body.data;
}

//************************************************************** */