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

describe("Repair Order tenant isolation integration", () => {
  it("prevents cross-organization Repair Order access and foreign customer/vehicle references", async () => {
    const { agent, organizationId: organizationAId } =
      await createAuthenticatedAgent();

    const suffix = createSafeSuffix();

    //************************************************************** */
    // Create Organization B.

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `RO Tenant Isolation B ${suffix}`,
        slug: `ro-tenant-isolation-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId = organizationBResponse.body.data.id;

    assert.equal(typeof organizationBId, "string");

    assert.notEqual(organizationAId, organizationBId);

    //************************************************************** */
    // Organization B fixtures.

    await switchOrganization(agent, organizationBId);

    const customerBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Foreign",
        lastName: `RO-Customer-${suffix}`,
      });

    assert.equal(customerBResponse.status, 201);

    const customerBId = customerBResponse.body.data.id;

    //************************************************************** */

    const vehicleBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/vehicles`)
      .send({
        customerId: customerBId,
        year: 2025,
        make: "Honda",
        model: "CRF450R",
        vin: `RO-TENANT-B-${suffix}`,
        type: "MOTORCYCLE",
        classification: "SERVICE",
        inventoryStatus: "AVAILABLE",
      });

    assert.equal(vehicleBResponse.status, 201);

    const vehicleBId = vehicleBResponse.body.data.id;

    //************************************************************** */

    const repairOrderBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/repair-orders`)
      .send({
        customerId: customerBId,
        vehicleId: vehicleBId,
        complaint: "Organization B tenant-isolation repair order.",
        priority: "STANDARD",
      });

    assert.equal(repairOrderBResponse.status, 201);

    const repairOrderBId = repairOrderBResponse.body.data.id;

    //************************************************************** */
    // Organization A fixtures.

    await switchOrganization(agent, organizationAId);

    const customerAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Local",
        lastName: `RO-Customer-${suffix}`,
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
        vin: `RO-TENANT-A-${suffix}`,
        type: "MOTORCYCLE",
        classification: "SERVICE",
        inventoryStatus: "AVAILABLE",
      });

    assert.equal(vehicleAResponse.status, 201);

    const vehicleAId = vehicleAResponse.body.data.id;

    //************************************************************** */
    // READ ISOLATION
    //
    // Organization A must not be able to retrieve Organization B's RO.

    const getForeignRepairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderBId}`,
    );

    assert.equal(getForeignRepairOrderResponse.status, 404);

    assert.equal(
      getForeignRepairOrderResponse.body.code,
      "REPAIR_ORDER_NOT_FOUND",
    );

    //************************************************************** */
    // UPDATE ISOLATION
    //
    // Organization A must not be able to mutate Organization B's RO.

    const updateForeignRepairOrderResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderBId}`,
      )
      .send({
        priority: "EMERGENCY",
        notes: "CROSS TENANT MUTATION",
      });

    assert.equal(updateForeignRepairOrderResponse.status, 404);

    assert.equal(
      updateForeignRepairOrderResponse.body.code,
      "REPAIR_ORDER_NOT_FOUND",
    );

    //************************************************************** */
    // STATUS ISOLATION
    //
    // Workflow endpoints must enforce the same tenant boundary.

    const statusForeignRepairOrderResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/repair-orders/${repairOrderBId}/status`,
      )
      .send({
        status: "AWAITING_CUSTOMER_APPROVAL",
        notes: "CROSS TENANT STATUS MUTATION",
        automatic: false,
      });

    assert.equal(statusForeignRepairOrderResponse.status, 404);

    assert.equal(
      statusForeignRepairOrderResponse.body.code,
      "REPAIR_ORDER_NOT_FOUND",
    );

    //************************************************************** */
    // LIST ISOLATION
    //
    // Organization B's RO must not leak through Organization A's
    // collection endpoint.

    const listResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/repair-orders`,
    );

    assert.equal(listResponse.status, 200);

    assert.equal(
      listResponse.body.data.some(
        (repairOrder: { id: string }) => repairOrder.id === repairOrderBId,
      ),
      false,
    );

    //************************************************************** */
    // FOREIGN CUSTOMER INJECTION
    //
    // Valid Organization A vehicle + Organization B customer.

    const foreignCustomerResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/repair-orders`)
      .send({
        customerId: customerBId,
        vehicleId: vehicleAId,
        complaint: "Cross-tenant customer injection attempt.",
      });

    assert.equal(foreignCustomerResponse.status, 400);

    assert.equal(
      foreignCustomerResponse.body.code,
      "REPAIR_ORDER_CUSTOMER_INVALID",
    );

    //************************************************************** */
    // FOREIGN VEHICLE INJECTION
    //
    // Valid Organization A customer + Organization B vehicle.

    const foreignVehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/repair-orders`)
      .send({
        customerId: customerAId,
        vehicleId: vehicleBId,
        complaint: "Cross-tenant vehicle injection attempt.",
      });

    assert.equal(foreignVehicleResponse.status, 400);

    assert.equal(
      foreignVehicleResponse.body.code,
      "REPAIR_ORDER_VEHICLE_INVALID",
    );

    //************************************************************** */
    // FOREIGN CUSTOMER + VEHICLE INJECTION
    //
    // Even though Customer B and Vehicle B are legitimately related
    // to each other, Organization A must not be able to create an RO
    // using the pair.

    const foreignPairResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/repair-orders`)
      .send({
        customerId: customerBId,
        vehicleId: vehicleBId,
        complaint: "Cross-tenant customer and vehicle injection attempt.",
      });

    assert.equal(foreignPairResponse.status, 400);

    assert.equal(
      foreignPairResponse.body.code,
      "REPAIR_ORDER_CUSTOMER_INVALID",
    );

    //************************************************************** */
    // DATABASE INVARIANTS
    //
    // Confirm the rejected Organization A operations did not mutate
    // Organization B's repair order.

    const storedRepairOrder = await prisma.repairOrder.findUniqueOrThrow({
      where: {
        id: repairOrderBId,
      },
    });

    assert.equal(storedRepairOrder.organizationId, organizationBId);

    assert.equal(storedRepairOrder.customerId, customerBId);

    assert.equal(storedRepairOrder.vehicleId, vehicleBId);

    assert.equal(storedRepairOrder.status, "ESTIMATE");

    assert.equal(storedRepairOrder.priority, "STANDARD");

    assert.equal(storedRepairOrder.notes, null);

    assert.equal(
      storedRepairOrder.complaint,
      "Organization B tenant-isolation repair order.",
    );

    //************************************************************** */
    // Confirm the rejected foreign-reference attempts did not create
    // an Organization A RO pointing at Organization B resources.

    const crossTenantCustomerReference = await prisma.repairOrder.findFirst({
      where: {
        organizationId: organizationAId,
        customerId: customerBId,
      },
    });

    assert.equal(crossTenantCustomerReference, null);

    const crossTenantVehicleReference = await prisma.repairOrder.findFirst({
      where: {
        organizationId: organizationAId,
        vehicleId: vehicleBId,
      },
    });

    assert.equal(crossTenantVehicleReference, null);
  });
});
