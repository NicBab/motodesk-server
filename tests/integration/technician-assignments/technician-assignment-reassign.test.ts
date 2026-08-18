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
          `reassign-tech-${suffix}@motodesk.test`,

        passwordHash:
          "integration-test-not-used",

        firstName:
          "Reassign",

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

describe(
  "Technician reassignment integration",
  () => {
    it(
      "reassigns an active repair order technician and updates the primary technician",
      async () => {
        const {
          agent,
          organizationId,
          membershipId,
        } =
          await createAuthenticatedAgent();

        const technician =
          await createEligibleTechnician(
            organizationId,
          );

        const suffix =
          Date.now().toString();

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
                "Reassignment",
              lastName:
                "Customer",
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
                "Honda",
              model:
                "CRF450R",
              vin:
                `TECH-REASSIGN-${suffix}`,
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
                "Technician reassignment test.",
            });

        assert.equal(
          repairOrderResponse.status,
          201,
        );

        const repairOrderId =
          repairOrderResponse.body.data.id;

        //************************************************************** */
        // Initial Assignment

        const initialAssignmentResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderId}`,
            )
            .send({
              technicianMembershipId:
                membershipId,

              notes:
                "Initial owner assignment.",
            });

        assert.equal(
          initialAssignmentResponse.status,
          200,
        );

        const initialAssignmentId =
          initialAssignmentResponse.body.data.id;

        //************************************************************** */
        // Reassign

        const reassignResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/technician-assignments/repair-orders/${repairOrderId}/reassign`,
            )
            .send({
              technicianMembershipId:
                technician.id,

              notes:
                "Transferred to technician.",
            });

        assert.equal(
          reassignResponse.status,
          200,
        );

        assert.equal(
          reassignResponse.body.data.status,
          "ACTIVE",
        );

        assert.equal(
          reassignResponse.body.data.technicianMembershipId,
          technician.id,
        );

        assert.notEqual(
          reassignResponse.body.data.id,
          initialAssignmentId,
        );

        //************************************************************** */
        // Verify Old Assignment History

        const oldAssignment =
          await prisma.technicianAssignment.findUnique({
            where: {
              id:
                initialAssignmentId,
            },
          });

        assert.notEqual(
          oldAssignment,
          null,
        );

        assert.equal(
          oldAssignment?.status,
          "REASSIGNED",
        );

        assert.notEqual(
          oldAssignment?.endedAt,
          null,
        );

        //************************************************************** */
        // Verify RO Primary Technician

        const updatedRepairOrderResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
          );

        assert.equal(
          updatedRepairOrderResponse.status,
          200,
        );

        assert.equal(
          updatedRepairOrderResponse.body.data.primaryTechnicianMembershipId,
          technician.id,
        );
      },
    );
  },
);