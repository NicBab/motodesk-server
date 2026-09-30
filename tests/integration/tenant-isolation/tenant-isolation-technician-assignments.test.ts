import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

function createSafeSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

//************************************************************** */

async function switchOrganization(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
) {
  const response = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
}

//************************************************************** */

async function createRepairOrder(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
) {
  const customerResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/customers`,
    )
    .send({
      type: "INDIVIDUAL",
      firstName: label,
      lastName: `Assignment-Customer-${suffix}`,
    });

  assert.equal(customerResponse.status, 201);

  const customerId =
    customerResponse.body.data.id;

  //************************************************************** */

  const vehicleResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/vehicles`,
    )
    .send({
      customerId,
      make: "Honda",
      model: "CRF450R",
      vin: `TECH-ASSIGN-${label}-${suffix}`,
      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  const vehicleId =
    vehicleResponse.body.data.id;

  //************************************************************** */

  const repairOrderResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders`,
    )
    .send({
      customerId,
      vehicleId,
      complaint:
        `${label} technician-assignment tenant isolation fixture.`,
    });

  assert.equal(
    repairOrderResponse.status,
    201,
  );

  return repairOrderResponse.body.data;
}

//************************************************************** */

async function createTechnicianMembership(
  organizationId: string,
  suffix: string,
  label: string,
) {
  const user =
    await prisma.user.create({
      data: {
        email:
          `tenant-tech-${label.toLowerCase()}-${suffix}@motodesk.test`,

        passwordHash:
          "integration-test-not-used",

        firstName:
          label,

        lastName:
          "Tenant Technician",
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
  "Technician Assignment tenant isolation integration",
  () => {
    it(
      "prevents foreign repair-order assignment operations and foreign technician membership references",
      async () => {
        const {
          agent,

          organizationId:
            organizationAId,

          membershipId:
            ownerMembershipAId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          createSafeSuffix();

        //************************************************************** */
        // ORGANIZATION B

        const organizationBResponse =
          await agent
            .post(
              "/api/v1/organizations",
            )
            .send({
              name:
                `Technician Assignment Tenant B ${suffix}`,

              slug:
                `technician-assignment-tenant-b-${suffix}`,
            });

        assert.equal(
          organizationBResponse.status,
          201,
        );

        const organizationBId =
          organizationBResponse.body.data.id;

        //************************************************************** */
        // ELIGIBLE TECHNICIANS

        const technicianA =
          await createTechnicianMembership(
            organizationAId,
            suffix,
            "A",
          );

        const technicianB =
          await createTechnicianMembership(
            organizationBId,
            suffix,
            "B",
          );

        //************************************************************** */
        // ORGANIZATION B RO

        await switchOrganization(
          agent,
          organizationBId,
        );

        const repairOrderB =
          await createRepairOrder(
            agent,
            organizationBId,
            suffix,
            "B",
          );

        //************************************************************** */
        // Legitimate B assignment.
        //
        // This gives us a protected foreign assignment and a populated
        // foreign RO primary-technician pointer.

        const assignmentBResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationBId}/technician-assignments/repair-orders/${repairOrderB.id}`,
            )
            .send({
              technicianMembershipId:
                technicianB.id,

              notes:
                "Protected Organization B assignment.",
            });

        assert.equal(
          assignmentBResponse.status,
          200,
        );

        const assignmentB =
          assignmentBResponse.body.data;

        //************************************************************** */
        // ORGANIZATION A RO

        await switchOrganization(
          agent,
          organizationAId,
        );

        const repairOrderA =
          await createRepairOrder(
            agent,
            organizationAId,
            suffix,
            "A",
          );

        //************************************************************** */
        // BASELINES

        const initialRepairOrderA =
          await prisma.repairOrder.findUniqueOrThrow({
            where: {
              id:
                repairOrderA.id,
            },
          });

        const initialRepairOrderB =
          await prisma.repairOrder.findUniqueOrThrow({
            where: {
              id:
                repairOrderB.id,
            },
          });

        const initialAssignmentB =
          await prisma.technicianAssignment.findUniqueOrThrow({
            where: {
              id:
                assignmentB.id,
            },
          });

        const initialAssignmentCountA =
          await prisma.technicianAssignment.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        //************************************************************** */
        // FOREIGN REPAIR ORDER — ASSIGN
        //
        // A cannot create an assignment against B's RO even using a
        // valid A technician.

        const foreignRepairOrderAssignResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/technician-assignments/repair-orders/${repairOrderB.id}`,
            )
            .send({
              technicianMembershipId:
                technicianA.id,

              notes:
                "Cross-tenant RO assignment attack.",
            });

        assert.equal(
          foreignRepairOrderAssignResponse.status,
          404,
        );

        assert.equal(
          foreignRepairOrderAssignResponse.body.code,
          "REPAIR_ORDER_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN TECHNICIAN MEMBERSHIP — ASSIGN
        //
        // A's RO cannot reference B's technician membership.

        const foreignTechnicianAssignResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/technician-assignments/repair-orders/${repairOrderA.id}`,
            )
            .send({
              technicianMembershipId:
                technicianB.id,

              notes:
                "Cross-tenant technician assignment attack.",
            });

        assert.equal(
          foreignTechnicianAssignResponse.status,
          400,
        );

        assert.equal(
          foreignTechnicianAssignResponse.body.code,
          "TECHNICIAN_ASSIGNMENT_INVALID_TECHNICIAN",
        );

        //************************************************************** */
        // No rejected attack created an A assignment.

        const assignmentCountAAfterAttacks =
          await prisma.technicianAssignment.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        assert.equal(
          assignmentCountAAfterAttacks,
          initialAssignmentCountA,
        );

        //************************************************************** */
        // A's RO must still have no technician.

        const repairOrderAAfterAttacks =
          await prisma.repairOrder.findUniqueOrThrow({
            where: {
              id:
                repairOrderA.id,
            },
          });

        assert.equal(
          repairOrderAAfterAttacks.organizationId,
          organizationAId,
        );

        assert.equal(
          repairOrderAAfterAttacks.primaryTechnicianMembershipId,
          initialRepairOrderA.primaryTechnicianMembershipId,
        );

        assert.equal(
          repairOrderAAfterAttacks.primaryTechnicianMembershipId,
          null,
        );

        //************************************************************** */
        // Create legitimate A assignment.
        //
        // We need an active local assignment to attack reassignment.

        const assignmentAResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/technician-assignments/repair-orders/${repairOrderA.id}`,
            )
            .send({
              technicianMembershipId:
                technicianA.id,

              notes:
                "Legitimate Organization A assignment.",
            });

        assert.equal(
          assignmentAResponse.status,
          200,
        );

        const assignmentA =
          assignmentAResponse.body.data;

        //************************************************************** */
        // FOREIGN TECHNICIAN MEMBERSHIP — REASSIGN
        //
        // Existing A assignment cannot be replaced by B's technician.

        const foreignTechnicianReassignResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/technician-assignments/repair-orders/${repairOrderA.id}/reassign`,
            )
            .send({
              technicianMembershipId:
                technicianB.id,

              notes:
                "Cross-tenant technician reassignment attack.",
            });

        assert.equal(
          foreignTechnicianReassignResponse.status,
          400,
        );

        assert.equal(
          foreignTechnicianReassignResponse.body.code,
          "TECHNICIAN_ASSIGNMENT_INVALID_TECHNICIAN",
        );

        //************************************************************** */
        // FOREIGN REPAIR ORDER — REASSIGN
        //
        // B has an active assignment, but A must not be able to touch it.

        const foreignRepairOrderReassignResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/technician-assignments/repair-orders/${repairOrderB.id}/reassign`,
            )
            .send({
              technicianMembershipId:
                technicianA.id,

              notes:
                "Cross-tenant RO reassignment attack.",
            });

        assert.equal(
          foreignRepairOrderReassignResponse.status,
          404,
        );

        assert.equal(
          foreignRepairOrderReassignResponse.body.code,
          "REPAIR_ORDER_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN REPAIR ORDER — REMOVE
        //
        // A must not remove B's active assignment.

        const foreignRemoveResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/technician-assignments/repair-orders/${repairOrderB.id}/remove`,
            )
            .send({
              notes:
                "Cross-tenant assignment removal attack.",
            });

        assert.equal(
          foreignRemoveResponse.status,
          404,
        );

        assert.equal(
          foreignRemoveResponse.body.code,
          "REPAIR_ORDER_NOT_FOUND",
        );

        //************************************************************** */
        // DATABASE INVARIANT — A assignment remains active/local.

        const storedAssignmentA =
          await prisma.technicianAssignment.findUniqueOrThrow({
            where: {
              id:
                assignmentA.id,
            },
          });

        assert.equal(
          storedAssignmentA.organizationId,
          organizationAId,
        );

        assert.equal(
          storedAssignmentA.repairOrderId,
          repairOrderA.id,
        );

        assert.equal(
          storedAssignmentA.technicianMembershipId,
          technicianA.id,
        );

        assert.equal(
          storedAssignmentA.status,
          "ACTIVE",
        );

        //************************************************************** */
        // DATABASE INVARIANT — A RO still points to Technician A.

        const storedRepairOrderA =
          await prisma.repairOrder.findUniqueOrThrow({
            where: {
              id:
                repairOrderA.id,
            },
          });

        assert.equal(
          storedRepairOrderA.organizationId,
          organizationAId,
        );

        assert.equal(
          storedRepairOrderA.primaryTechnicianMembershipId,
          technicianA.id,
        );

        //************************************************************** */
        // DATABASE INVARIANT — B assignment untouched.

        const storedAssignmentB =
          await prisma.technicianAssignment.findUniqueOrThrow({
            where: {
              id:
                assignmentB.id,
            },
          });

        assert.equal(
          storedAssignmentB.organizationId,
          organizationBId,
        );

        assert.equal(
          storedAssignmentB.repairOrderId,
          initialAssignmentB.repairOrderId,
        );

        assert.equal(
          storedAssignmentB.technicianMembershipId,
          initialAssignmentB.technicianMembershipId,
        );

        assert.equal(
          storedAssignmentB.status,
          initialAssignmentB.status,
        );

        assert.equal(
          storedAssignmentB.endedAt,
          initialAssignmentB.endedAt,
        );

        //************************************************************** */
        // DATABASE INVARIANT — B RO pointer untouched.

        const storedRepairOrderB =
          await prisma.repairOrder.findUniqueOrThrow({
            where: {
              id:
                repairOrderB.id,
            },
          });

        assert.equal(
          storedRepairOrderB.organizationId,
          organizationBId,
        );

        assert.equal(
          storedRepairOrderB.primaryTechnicianMembershipId,
          initialRepairOrderB.primaryTechnicianMembershipId,
        );

        assert.equal(
          storedRepairOrderB.primaryTechnicianMembershipId,
          technicianB.id,
        );

        //************************************************************** */
        // Explicit cross-tenant invariant:
        // no A assignment may reference Technician B.

        const crossTenantTechnicianAssignment =
          await prisma.technicianAssignment.findFirst({
            where: {
              organizationId:
                organizationAId,

              technicianMembershipId:
                technicianB.id,
            },
          });

        assert.equal(
          crossTenantTechnicianAssignment,
          null,
        );

        //************************************************************** */
        // Explicit cross-tenant invariant:
        // no A assignment may reference RO B.

        const crossTenantRepairOrderAssignment =
          await prisma.technicianAssignment.findFirst({
            where: {
              organizationId:
                organizationAId,

              repairOrderId:
                repairOrderB.id,
            },
          });

        assert.equal(
          crossTenantRepairOrderAssignment,
          null,
        );

        //************************************************************** */
        // Ensure A's authenticated owner membership wasn't accidentally
        // involved in the technician relationship.

        assert.notEqual(
          ownerMembershipAId,
          technicianB.id,
        );
      },
    );
  },
);

//************************************************************** */