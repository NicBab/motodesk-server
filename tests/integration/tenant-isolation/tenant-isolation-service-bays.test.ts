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
      lastName: `Service-Bay-Customer-${suffix}`,
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
      vin: `BAY-${label}-${suffix}`,
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
        `${label} service-bay tenant isolation fixture.`,
    });

  assert.equal(
    repairOrderResponse.status,
    201,
  );

  return repairOrderResponse.body.data;
}

//************************************************************** */

async function createServiceBay(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
) {
  const response = await agent
    .post(
      `/api/v1/organizations/${organizationId}/service-bays`,
    )
    .send({
      name:
        `Bay-${label}-${suffix}`,

      description:
        `${label} protected service bay.`,
    });

  assert.equal(
    response.status,
    200,
  );

  assert.equal(
    response.body.success,
    true,
  );

  return response.body.data;
}

//************************************************************** */

describe(
  "Service Bay tenant isolation integration",
  () => {
    it(
      "prevents foreign service-bay access through lists, status changes, assignments, and releases",
      async () => {
        const {
          agent,
          organizationId: organizationAId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          createSafeSuffix();

        //************************************************************** */
        // ORGANIZATION B

        const organizationBResponse =
          await agent
            .post("/api/v1/organizations")
            .send({
              name:
                `Service Bay Tenant B ${suffix}`,

              slug:
                `service-bay-tenant-b-${suffix}`,
            });

        assert.equal(
          organizationBResponse.status,
          201,
        );

        const organizationBId =
          organizationBResponse.body.data.id;

        //************************************************************** */
        // ORGANIZATION B RESOURCES

        await switchOrganization(
          agent,
          organizationBId,
        );

        const serviceBayB =
          await createServiceBay(
            agent,
            organizationBId,
            suffix,
            "B",
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

        const assignmentBResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationBId}/service-bays/repair-orders/${repairOrderB.id}/assign`,
            )
            .send({
              serviceBayId:
                serviceBayB.id,

              notes:
                "Protected Organization B bay assignment.",
            });

        assert.equal(
          assignmentBResponse.status,
          200,
        );

        const assignmentB =
          assignmentBResponse.body.data;

        //************************************************************** */
        // ORGANIZATION A RESOURCES

        await switchOrganization(
          agent,
          organizationAId,
        );

        const serviceBayA =
          await createServiceBay(
            agent,
            organizationAId,
            suffix,
            "A",
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

        const initialBayB =
          await prisma.serviceBay.findUniqueOrThrow({
            where: {
              id:
                serviceBayB.id,
            },
          });

        const initialAssignmentB =
          await prisma.serviceBayAssignment.findUniqueOrThrow({
            where: {
              id:
                assignmentB.id,
            },
          });

        const initialAssignmentCountA =
          await prisma.serviceBayAssignment.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        //************************************************************** */
        // LIST ISOLATION

        const listResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/service-bays`,
          );

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.data.some(
            (
              serviceBay: {
                id: string;
              },
            ) =>
              serviceBay.id ===
              serviceBayB.id,
          ),
          false,
        );

        assert.equal(
          listResponse.body.data.some(
            (
              serviceBay: {
                id: string;
              },
            ) =>
              serviceBay.id ===
              serviceBayA.id,
          ),
          true,
        );

        //************************************************************** */
        // FOREIGN SERVICE BAY STATUS MUTATION

        const foreignStatusResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/service-bays/${serviceBayB.id}/status`,
            )
            .send({
              status:
                "MAINTENANCE",

              notes:
                "Cross-tenant status attack.",
            });

        assert.equal(
          foreignStatusResponse.status,
          404,
        );

        assert.equal(
          foreignStatusResponse.body.code,
          "SERVICE_BAY_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN SERVICE BAY INJECTION
        //
        // Local A repair order cannot be assigned to B's bay.

        const foreignBayAssignmentResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/service-bays/repair-orders/${repairOrderA.id}/assign`,
            )
            .send({
              serviceBayId:
                serviceBayB.id,

              notes:
                "Cross-tenant bay reference attack.",
            });

        assert.equal(
          foreignBayAssignmentResponse.status,
          404,
        );

        assert.equal(
          foreignBayAssignmentResponse.body.code,
          "SERVICE_BAY_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN REPAIR ORDER INJECTION
        //
        // B's RO cannot be assigned to A's bay.

        const foreignRepairOrderAssignmentResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/service-bays/repair-orders/${repairOrderB.id}/assign`,
            )
            .send({
              serviceBayId:
                serviceBayA.id,

              notes:
                "Cross-tenant RO reference attack.",
            });

        assert.equal(
          foreignRepairOrderAssignmentResponse.status,
          404,
        );

        assert.equal(
          foreignRepairOrderAssignmentResponse.body.code,
          "REPAIR_ORDER_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN RELEASE
        //
        // B has an active bay assignment, but A cannot release it.

        const foreignReleaseResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/service-bays/repair-orders/${repairOrderB.id}/release`,
            )
            .send({
              notes:
                "Cross-tenant release attack.",
            });

        assert.equal(
          foreignReleaseResponse.status,
          404,
        );

        assert.equal(
          foreignReleaseResponse.body.code,
          "REPAIR_ORDER_NOT_FOUND",
        );

        //************************************************************** */
        // REJECTED ATTACKS CREATED NO A ASSIGNMENTS

        const assignmentCountAAfterAttacks =
          await prisma.serviceBayAssignment.count({
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
        // ORGANIZATION B BAY UNCHANGED

        const storedBayB =
          await prisma.serviceBay.findUniqueOrThrow({
            where: {
              id:
                serviceBayB.id,
            },
          });

        assert.equal(
          storedBayB.organizationId,
          organizationBId,
        );

        assert.equal(
          storedBayB.name,
          initialBayB.name,
        );

        assert.equal(
          storedBayB.status,
          initialBayB.status,
        );

        //************************************************************** */
        // ORGANIZATION B ASSIGNMENT UNCHANGED

        const storedAssignmentB =
          await prisma.serviceBayAssignment.findUniqueOrThrow({
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
          storedAssignmentB.serviceBayId,
          initialAssignmentB.serviceBayId,
        );

        assert.equal(
          storedAssignmentB.status,
          initialAssignmentB.status,
        );

        assert.equal(
          storedAssignmentB.releasedAt,
          initialAssignmentB.releasedAt,
        );

        //************************************************************** */
        // NO A ASSIGNMENT MAY REFERENCE BAY B

        const crossTenantBayAssignment =
          await prisma.serviceBayAssignment.findFirst({
            where: {
              organizationId:
                organizationAId,

              serviceBayId:
                serviceBayB.id,
            },
          });

        assert.equal(
          crossTenantBayAssignment,
          null,
        );

        //************************************************************** */
        // NO A ASSIGNMENT MAY REFERENCE RO B

        const crossTenantRepairOrderAssignment =
          await prisma.serviceBayAssignment.findFirst({
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
      },
    );
  },
);

//************************************************************** */