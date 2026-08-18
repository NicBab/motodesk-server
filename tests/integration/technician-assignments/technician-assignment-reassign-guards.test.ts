import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

async function createEligibleTechnician(
  organizationId: string,
) {
  const suffix =
    `${Date.now()}-${Math.random()}`;

  const user =
    await prisma.user.create({
      data: {
        email:
          `reassign-guard-${suffix}@motodesk.test`,

        passwordHash:
          "integration-test-not-used",

        firstName:
          "Guard",

        lastName:
          "Technician",
      },
    });

  return prisma.membership.create({
    data: {
      userId:
        user.id,

      organizationId,

      role:
        "TECHNICIAN",

      status:
        "ACTIVE",
    },
  });
}

//************************************************************** */

async function createRepairOrderFixture() {
  const {
    agent,
    organizationId,
    membershipId,
  } =
    await createAuthenticatedAgent();

  const suffix =
    `${Date.now()}-${Math.random()}`;

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
          "Assignment",

        lastName:
          "Guard",
      });

  assert.equal(
    customerResponse.status,
    201,
  );

  //************************************************************** */
  // Vehicle

  const vehicleResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/vehicles`,
      )
      .send({
        customerId:
          customerResponse.body.data.id,

        make:
          "Yamaha",

        model:
          "YZ250F",

        vin:
          `REASSIGN-GUARD-${suffix}`,

        type:
          "MOTORCYCLE",
      });

  assert.equal(
    vehicleResponse.status,
    201,
  );

  //************************************************************** */
  // Repair Order

  const repairOrderResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders`,
      )
      .send({
        customerId:
          customerResponse.body.data.id,

        vehicleId:
          vehicleResponse.body.data.id,

        complaint:
          "Technician reassignment guard test.",
      });

  assert.equal(
    repairOrderResponse.status,
    201,
  );

  return {
    agent,
    organizationId,
    membershipId,
    repairOrderId:
      repairOrderResponse.body.data.id,
  };
}

//************************************************************** */

describe(
  "Technician reassignment guards integration",
  () => {
    it(
      "rejects reassignment when no active technician assignment exists",
      async () => {
        const {
          agent,
          organizationId,
          repairOrderId,
        } =
          await createRepairOrderFixture();

        const technician =
          await createEligibleTechnician(
            organizationId,
          );

        const response =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderId}/reassign`,
            )
            .send({
              technicianMembershipId:
                technician.id,

              notes:
                "Attempt reassignment without initial assignment.",
            });

        assert.equal(
          response.status,
          400,
        );

        assert.equal(
          response.body.code,
          "TECHNICIAN_REASSIGNMENT_NO_ACTIVE_ASSIGNMENT",
        );
      },
    );

    //************************************************************** */

    it(
      "rejects reassignment to the currently assigned technician",
      async () => {
        const {
          agent,
          organizationId,
          membershipId,
          repairOrderId,
        } =
          await createRepairOrderFixture();

        //************************************************************** */
        // Initial Assignment

        const assignmentResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderId}`,
            )
            .send({
              technicianMembershipId:
                membershipId,

              notes:
                "Initial assignment.",
            });

        assert.equal(
          assignmentResponse.status,
          200,
        );

        //************************************************************** */
        // Attempt Same-Technician Reassignment

        const response =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderId}/reassign`,
            )
            .send({
              technicianMembershipId:
                membershipId,

              notes:
                "Attempt same technician reassignment.",
            });

        assert.equal(
          response.status,
          400,
        );

        assert.equal(
          response.body.code,
          "TECHNICIAN_REASSIGNMENT_SAME_TECHNICIAN",
        );
      },
    );
  },
);