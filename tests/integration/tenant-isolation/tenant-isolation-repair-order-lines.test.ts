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
  const response = await agent.post("/api/v1/auth/switch-organization").send({
    organizationId,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
}

//************************************************************** */

describe("Repair Order nested tenant isolation integration", () => {
  it("protects labor lines, part lines, technician memberships, and inventory-part references across organizations", async () => {
    const {
      agent,
      organizationId: organizationAId,
      membershipId: membershipAId,
    } = await createAuthenticatedAgent();

    const suffix = createSafeSuffix();

    //************************************************************** */
    // Create Organization B.

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `RO Lines Tenant B ${suffix}`,
        slug: `ro-lines-tenant-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId = organizationBResponse.body.data.id;

    //************************************************************** */
    // Find the authenticated owner's membership in Organization B.
    //
    // We deliberately use a real membership belonging to B so it can
    // later be injected into Organization A labor/RO operations.

    const membershipsResponse = await agent.get("/api/v1/organizations/me");

    assert.equal(membershipsResponse.status, 200);

    const organizationBMembership = membershipsResponse.body.data.find(
      (membership: {
        id: string;
        organization?: {
          id?: string;
        };
      }) => membership.organization?.id === organizationBId,
    );

    assert.ok(organizationBMembership);

    const membershipBId = organizationBMembership.id;

    assert.equal(typeof membershipBId, "string");

    assert.notEqual(membershipAId, membershipBId);

    //************************************************************** */
    // ORGANIZATION B FIXTURES

    await switchOrganization(agent, organizationBId);

    //************************************************************** */
    // Customer B

    const customerBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Foreign",
        lastName: `Lines-Customer-${suffix}`,
      });

    assert.equal(customerBResponse.status, 201);

    const customerBId = customerBResponse.body.data.id;

    //************************************************************** */
    // Vehicle B

    const vehicleBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/vehicles`)
      .send({
        customerId: customerBId,
        year: 2025,
        make: "Honda",
        model: "CRF450R",
        vin: `RO-LINES-B-${suffix}`,
        type: "MOTORCYCLE",
        classification: "SERVICE",
      });

    assert.equal(vehicleBResponse.status, 201);

    const vehicleBId = vehicleBResponse.body.data.id;

    //************************************************************** */
    // Repair Order B

    const repairOrderBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/repair-orders`)
      .send({
        customerId: customerBId,
        vehicleId: vehicleBId,
        complaint: "Organization B nested tenant-isolation RO.",
      });

    assert.equal(repairOrderBResponse.status, 201);

    const repairOrderBId = repairOrderBResponse.body.data.id;

    //************************************************************** */
    // Labor Line B

    const laborLineBResponse = await agent
      .post(
        `/api/v1/organizations/${organizationBId}/repair-orders/${repairOrderBId}/labor-lines`,
      )
      .send({
        technicianMembershipId: membershipBId,
        description: "Organization B protected labor line",
        hours: 2,
        rate: 125,
      });

    assert.equal(laborLineBResponse.status, 201);

    const laborLineBId = laborLineBResponse.body.data.id;

    //************************************************************** */
    // Inventory Part B

    const partNumberB = `RO-LINES-PART-B-${suffix}`;

    const partBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/parts`)
      .send({
        partNumber: partNumberB,
        description: "Organization B protected inventory part",
        qtyOnHand: 10,
        costPrice: 20,
        sellPrice: 40,
      });

    assert.equal(partBResponse.status, 201);

    const partBId = partBResponse.body.data.id;

    //************************************************************** */
    // Part Line B

    const partLineBResponse = await agent
      .post(
        `/api/v1/organizations/${organizationBId}/repair-orders/${repairOrderBId}/part-lines`,
      )
      .send({
        partId: partBId,
        partNumber: partNumberB,
        description: "Organization B protected RO part line",
        quantity: 2,
        unitPrice: 40,
        requiredQty: 2,
        approvedQty: 2,
        resolutionMethod: "SHOP_INVENTORY",
      });

    assert.equal(partLineBResponse.status, 201);

    const partLineBId = partLineBResponse.body.data.id;

    //************************************************************** */
    // ORGANIZATION A FIXTURES

    await switchOrganization(agent, organizationAId);

    const customerAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Local",
        lastName: `Lines-Customer-${suffix}`,
      });

    assert.equal(customerAResponse.status, 201);

    const customerAId = customerAResponse.body.data.id;

    //************************************************************** */

    const vehicleAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/vehicles`)
      .send({
        customerId: customerAId,
        year: 2025,
        make: "Yamaha",
        model: "YZ450F",
        vin: `RO-LINES-A-${suffix}`,
        type: "MOTORCYCLE",
        classification: "SERVICE",
      });

    assert.equal(vehicleAResponse.status, 201);

    const vehicleAId = vehicleAResponse.body.data.id;

    //************************************************************** */

    const repairOrderAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/repair-orders`)
      .send({
        customerId: customerAId,
        vehicleId: vehicleAId,
        complaint: "Organization A nested tenant-isolation RO.",
      });

    assert.equal(repairOrderAResponse.status, 201);

    const repairOrderAId = repairOrderAResponse.body.data.id;

    //************************************************************** */
    // Local Labor Line A

    const laborLineAResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/labor-lines`,
      )
      .send({
        technicianMembershipId: membershipAId,
        description: "Organization A protected labor line",
        hours: 1,
        rate: 100,
      });

    assert.equal(laborLineAResponse.status, 201);

    const laborLineAId = laborLineAResponse.body.data.id;

    //************************************************************** */
    // Local Inventory Part A

    const partNumberA = `RO-LINES-PART-A-${suffix}`;

    const partAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/parts`)
      .send({
        partNumber: partNumberA,
        description: "Organization A protected inventory part",
        qtyOnHand: 10,
        costPrice: 15,
        sellPrice: 30,
      });

    assert.equal(partAResponse.status, 201);

    const partAId = partAResponse.body.data.id;

    //************************************************************** */
    // Local Part Line A

    const partLineAResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/part-lines`,
      )
      .send({
        partId: partAId,
        partNumber: partNumberA,
        description: "Organization A protected RO part line",
        quantity: 1,
        unitPrice: 30,
        requiredQty: 1,
        approvedQty: 1,
        resolutionMethod: "SHOP_INVENTORY",
      });

    assert.equal(partLineAResponse.status, 201);

    const partLineAId = partLineAResponse.body.data.id;

    //************************************************************** */
    // FOREIGN PARENT RO — LABOR LIST
    //
    // Supplying Organization B's RO through Organization A must fail
    // before any nested labor data is returned.

    const foreignLaborListResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderBId}/labor-lines`,
    );

    assert.equal(foreignLaborListResponse.status, 404);

    assert.equal(foreignLaborListResponse.body.code, "REPAIR_ORDER_NOT_FOUND");

    //************************************************************** */
    // FOREIGN PARENT RO — PART LIST

    const foreignPartListResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderBId}/part-lines`,
    );

    assert.equal(foreignPartListResponse.status, 404);

    assert.equal(foreignPartListResponse.body.code, "REPAIR_ORDER_NOT_FOUND");

    //************************************************************** */
    // FOREIGN LABOR LINE ID UNDER A VALID ORGANIZATION A RO
    //
    // This specifically attacks the nested object boundary:
    //
    // Organization A RO ID + Organization B labor-line ID.

    const foreignLaborReadResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/labor-lines/${laborLineBId}`,
    );

    assert.equal(foreignLaborReadResponse.status, 404);

    assert.equal(
      foreignLaborReadResponse.body.code,
      "REPAIR_ORDER_LABOR_LINE_NOT_FOUND",
    );

    //************************************************************** */
    // Foreign labor line update.

    const foreignLaborUpdateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/labor-lines/${laborLineBId}`,
      )
      .send({
        description: "CROSS TENANT LABOR MUTATION",
        hours: 99,
      });

    assert.equal(foreignLaborUpdateResponse.status, 404);

    assert.equal(
      foreignLaborUpdateResponse.body.code,
      "REPAIR_ORDER_LABOR_LINE_NOT_FOUND",
    );

    //************************************************************** */
    // Foreign labor line delete.

    const foreignLaborDeleteResponse = await agent.delete(
      `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/labor-lines/${laborLineBId}`,
    );

    assert.equal(foreignLaborDeleteResponse.status, 404);

    assert.equal(
      foreignLaborDeleteResponse.body.code,
      "REPAIR_ORDER_LABOR_LINE_NOT_FOUND",
    );

    //************************************************************** */
    // FOREIGN PART LINE ID UNDER A VALID ORGANIZATION A RO

    const foreignPartLineReadResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/part-lines/${partLineBId}`,
    );

    assert.equal(foreignPartLineReadResponse.status, 404);

    assert.equal(
      foreignPartLineReadResponse.body.code,
      "REPAIR_ORDER_PART_LINE_NOT_FOUND",
    );

    //************************************************************** */
    // Foreign part line update.

    const foreignPartLineUpdateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/part-lines/${partLineBId}`,
      )
      .send({
        description: "CROSS TENANT PART MUTATION",
        quantity: 9,
      });

    assert.equal(foreignPartLineUpdateResponse.status, 404);

    assert.equal(
      foreignPartLineUpdateResponse.body.code,
      "REPAIR_ORDER_PART_LINE_NOT_FOUND",
    );

    //************************************************************** */
    // Foreign part-line inventory workflow action.
    //
    // Allocation is particularly important because it can affect
    // inventory state as well as the RO child record.

    const foreignPartAllocationResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/part-lines/${partLineBId}/allocate`,
      )
      .send({
        quantity: 1,
      });

    assert.equal(foreignPartAllocationResponse.status, 404);

    assert.equal(
      foreignPartAllocationResponse.body.code,
      "REPAIR_ORDER_PART_LINE_NOT_FOUND",
    );

    //************************************************************** */
    // Foreign part line delete.

    const foreignPartLineDeleteResponse = await agent.delete(
      `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/part-lines/${partLineBId}`,
    );

    assert.equal(foreignPartLineDeleteResponse.status, 404);

    assert.equal(
      foreignPartLineDeleteResponse.body.code,
      "REPAIR_ORDER_PART_LINE_NOT_FOUND",
    );

    //************************************************************** */
    // FOREIGN TECHNICIAN MEMBERSHIP INJECTION — CREATE LABOR LINE
    //
    // Organization B membership must not be assignable to an
    // Organization A labor line.

    const foreignTechnicianCreateResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/labor-lines`,
      )
      .send({
        technicianMembershipId: membershipBId,
        description: "Foreign technician injection attempt",
        hours: 1,
        rate: 100,
      });

    assert.equal(foreignTechnicianCreateResponse.status, 400);

    assert.equal(
      foreignTechnicianCreateResponse.body.code,
      "REPAIR_ORDER_LABOR_TECHNICIAN_INVALID",
    );

    //************************************************************** */
    // FOREIGN TECHNICIAN MEMBERSHIP INJECTION — UPDATE LABOR LINE

    const foreignTechnicianUpdateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/labor-lines/${laborLineAId}`,
      )
      .send({
        technicianMembershipId: membershipBId,
      });

    assert.equal(foreignTechnicianUpdateResponse.status, 400);

    assert.equal(
      foreignTechnicianUpdateResponse.body.code,
      "REPAIR_ORDER_LABOR_TECHNICIAN_INVALID",
    );

    //************************************************************** */
    // FOREIGN SERVICE ADVISOR MEMBERSHIP INJECTION
    //
    // The foreign owner membership has an otherwise allowed role.
    // It must still fail because it belongs to Organization B.

    const foreignAdvisorResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}`,
      )
      .send({
        serviceAdvisorMembershipId: membershipBId,
      });

    assert.equal(foreignAdvisorResponse.status, 400);

    assert.equal(
      foreignAdvisorResponse.body.code,
      "REPAIR_ORDER_SERVICE_ADVISOR_INVALID",
    );

    //************************************************************** */
    // FOREIGN PRIMARY TECHNICIAN MEMBERSHIP INJECTION

    const foreignPrimaryTechnicianResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}`,
      )
      .send({
        primaryTechnicianMembershipId: membershipBId,
      });

    assert.equal(foreignPrimaryTechnicianResponse.status, 400);

    assert.equal(
      foreignPrimaryTechnicianResponse.body.code,
      "REPAIR_ORDER_TECHNICIAN_INVALID",
    );

    //************************************************************** */
    // FOREIGN INVENTORY PART INJECTION
    //
    // Organization B's Part ID must not be attachable to an
    // Organization A RO part line.

    const foreignInventoryPartResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderAId}/part-lines`,
      )
      .send({
        partId: partBId,
        partNumber: partNumberB,
        description: "Foreign inventory part injection attempt",
        quantity: 1,
        unitPrice: 40,
        requiredQty: 1,
        approvedQty: 1,
        resolutionMethod: "SHOP_INVENTORY",
      });

    assert.equal(foreignInventoryPartResponse.status, 400);

    assert.equal(
      foreignInventoryPartResponse.body.code,
      "REPAIR_ORDER_PART_INVALID",
    );

    //************************************************************** */
    // DATABASE INVARIANTS — FOREIGN LABOR LINE

    const storedLaborLineB =
      await prisma.repairOrderLaborLine.findUniqueOrThrow({
        where: {
          id: laborLineBId,
        },
      });

    assert.equal(storedLaborLineB.repairOrderId, repairOrderBId);

    assert.equal(storedLaborLineB.technicianMembershipId, membershipBId);

    assert.equal(
      storedLaborLineB.description,
      "Organization B protected labor line",
    );

    assert.equal(Number(storedLaborLineB.hours), 2);

    //************************************************************** */
    // DATABASE INVARIANTS — FOREIGN PART LINE

    const storedPartLineB = await prisma.repairOrderPartLine.findUniqueOrThrow({
      where: {
        id: partLineBId,
      },
    });

    assert.equal(storedPartLineB.repairOrderId, repairOrderBId);

    assert.equal(storedPartLineB.partId, partBId);

    assert.equal(
      storedPartLineB.description,
      "Organization B protected RO part line",
    );

    assert.equal(Number(storedPartLineB.quantity), 2);

    assert.equal(Number(storedPartLineB.allocatedQty), 0);

    //************************************************************** */
    // DATABASE INVARIANTS — LOCAL LABOR LINE
    //
    // Failed technician injection must not replace Organization A's
    // valid technician membership.

    const storedLaborLineA =
      await prisma.repairOrderLaborLine.findUniqueOrThrow({
        where: {
          id: laborLineAId,
        },
      });

    assert.equal(storedLaborLineA.repairOrderId, repairOrderAId);

    assert.equal(storedLaborLineA.technicianMembershipId, membershipAId);

    //************************************************************** */
    // DATABASE INVARIANTS — LOCAL PART LINE

    const storedPartLineA = await prisma.repairOrderPartLine.findUniqueOrThrow({
      where: {
        id: partLineAId,
      },
    });

    assert.equal(storedPartLineA.repairOrderId, repairOrderAId);

    assert.equal(storedPartLineA.partId, partAId);

    //************************************************************** */
    // No Organization A labor line may reference Membership B.

    const crossTenantLaborMembership =
      await prisma.repairOrderLaborLine.findFirst({
        where: {
          repairOrder: {
            organizationId: organizationAId,
          },

          technicianMembershipId: membershipBId,
        },
      });

    assert.equal(crossTenantLaborMembership, null);

    //************************************************************** */
    // No Organization A RO part line may reference Part B.

    const crossTenantPartReference = await prisma.repairOrderPartLine.findFirst(
      {
        where: {
          repairOrder: {
            organizationId: organizationAId,
          },

          partId: partBId,
        },
      },
    );

    assert.equal(crossTenantPartReference, null);
  });
});
