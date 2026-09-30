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

describe("Core tenant isolation integration", () => {
  it("prevents one organization from reading or mutating another organization's core resources", async () => {
    const { agent, organizationId: organizationAId } =
      await createAuthenticatedAgent();

    const suffix = createSafeSuffix();

    //************************************************************** */
    // Create Organization B.
    //
    // The same authenticated owner controls both organizations.
    // This is intentional:
    //
    // We are testing object-level tenant isolation, not whether an
    // unrelated user can enter another organization's route.
    //
    // The access token will later be switched back to Organization A,
    // while IDs belonging to Organization B are deliberately supplied
    // through Organization A endpoints.

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `Tenant Isolation B ${suffix}`,

        slug: `tenant-isolation-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    assert.equal(organizationBResponse.body.success, true);

    const organizationBId = organizationBResponse.body.data.id;

    assert.equal(typeof organizationBId, "string");

    assert.notEqual(organizationAId, organizationBId);

    //************************************************************** */
    // Switch into Organization B and create foreign resources.

    await switchOrganization(agent, organizationBId);

    //************************************************************** */
    // Customer B

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Foreign",

        lastName: `Customer-${suffix}`,

        email: `foreign-customer-${suffix}@motodesk.test`,

        phone: "3375554100",
      });

    assert.equal(customerResponse.status, 201);

    const customerBId = customerResponse.body.data.id;

    //************************************************************** */
    // Vehicle B

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/vehicles`)
      .send({
        customerId: customerBId,

        year: 2025,

        make: "Honda",

        model: `Tenant-${suffix}`,

        vin: `TENANT-VIN-${suffix}`,

        mileage: 10,

        color: "Red",

        type: "MOTORCYCLE",

        classification: "SERVICE",

        inventoryStatus: "AVAILABLE",

        notes: "Organization B tenant-isolation vehicle.",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleBId = vehicleResponse.body.data.id;

    //************************************************************** */
    // Part B

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/parts`)
      .send({
        partNumber: `TENANT-PART-${suffix}`,

        description: "Organization B tenant-isolation part",

        brand: "MotoDesk Test",

        category: "Security Test",

        qtyOnHand: 4,

        reorderPoint: 1,

        costPrice: 10,

        sellPrice: 20,

        location: "TENANT-B",
      });

    assert.equal(partResponse.status, 201);

    const partBId = partResponse.body.data.id;

    //************************************************************** */
    // Vendor B

    const vendorResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/vendors`)
      .send({
        name: `Tenant Vendor B ${suffix}`,

        email: `foreign-vendor-${suffix}@motodesk.test`,

        phone: "3375554200",
      });

    assert.equal(vendorResponse.status, 201);

    const vendorBId = vendorResponse.body.data.id;

    //************************************************************** */
    // Employee B

    const employeeResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/employees`)
      .send({
        firstName: "Foreign",

        lastName: `Employee-${suffix}`,

        role: "TECHNICIAN",

        email: `foreign-employee-${suffix}@motodesk.test`,

        phone: "3375554300",

        hourlyRate: 25,

        laborRate: 120,

        isSchedulable: true,

        skills: "Tenant isolation testing",
      });

    assert.equal(employeeResponse.status, 201);

    const employeeBId = employeeResponse.body.data.id;

    //************************************************************** */
    // Switch the authenticated session back into Organization A.
    //
    // Everything below deliberately supplies Organization B IDs
    // through Organization A routes.

    await switchOrganization(agent, organizationAId);

    //************************************************************** */
    // CUSTOMER
    // Organization A must not be able to read Customer B.

    const getForeignCustomerResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/customers/${customerBId}`,
    );

    assert.equal(getForeignCustomerResponse.status, 404);

    assert.equal(getForeignCustomerResponse.body.code, "CUSTOMER_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to update Customer B.

    const updateForeignCustomerResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/customers/${customerBId}`,
      )
      .send({
        phone: "3375559999",

        notes: "CROSS TENANT MUTATION",
      });

    assert.equal(updateForeignCustomerResponse.status, 404);

    assert.equal(updateForeignCustomerResponse.body.code, "CUSTOMER_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to archive Customer B.

    const archiveForeignCustomerResponse = await agent.post(
      `/api/v1/organizations/${organizationAId}/customers/${customerBId}/archive`,
    );

    assert.equal(archiveForeignCustomerResponse.status, 404);

    assert.equal(
      archiveForeignCustomerResponse.body.code,
      "CUSTOMER_NOT_FOUND",
    );

    //************************************************************** */
    // VEHICLE
    // Organization A must not be able to read Vehicle B.

    const getForeignVehicleResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/vehicles/${vehicleBId}`,
    );

    assert.equal(getForeignVehicleResponse.status, 404);

    assert.equal(getForeignVehicleResponse.body.code, "VEHICLE_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to update Vehicle B.

    const updateForeignVehicleResponse = await agent
      .patch(`/api/v1/organizations/${organizationAId}/vehicles/${vehicleBId}`)
      .send({
        mileage: 999999,

        notes: "CROSS TENANT MUTATION",
      });

    assert.equal(updateForeignVehicleResponse.status, 404);

    assert.equal(updateForeignVehicleResponse.body.code, "VEHICLE_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to archive Vehicle B.

    const archiveForeignVehicleResponse = await agent.post(
      `/api/v1/organizations/${organizationAId}/vehicles/${vehicleBId}/archive`,
    );

    assert.equal(archiveForeignVehicleResponse.status, 404);

    assert.equal(archiveForeignVehicleResponse.body.code, "VEHICLE_NOT_FOUND");

    //************************************************************** */
    // PART
    // Organization A must not be able to read Part B.

    const getForeignPartResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/parts/${partBId}`,
    );

    assert.equal(getForeignPartResponse.status, 404);

    assert.equal(getForeignPartResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to update Part B.

    const updateForeignPartResponse = await agent
      .patch(`/api/v1/organizations/${organizationAId}/parts/${partBId}`)
      .send({
        description: "CROSS TENANT MUTATION",

        sellPrice: 9999,
      });

    assert.equal(updateForeignPartResponse.status, 404);

    assert.equal(updateForeignPartResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to archive Part B.

    const archiveForeignPartResponse = await agent.post(
      `/api/v1/organizations/${organizationAId}/parts/${partBId}/archive`,
    );

    assert.equal(archiveForeignPartResponse.status, 404);

    assert.equal(archiveForeignPartResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // VENDOR
    // Organization A must not be able to read Vendor B.

    const getForeignVendorResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/vendors/${vendorBId}`,
    );

    assert.equal(getForeignVendorResponse.status, 404);

    assert.equal(getForeignVendorResponse.body.code, "VENDOR_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to update Vendor B.

    const updateForeignVendorResponse = await agent
      .patch(`/api/v1/organizations/${organizationAId}/vendors/${vendorBId}`)
      .send({
        phone: "3375559999",

        notes: "CROSS TENANT MUTATION",
      });

    assert.equal(updateForeignVendorResponse.status, 404);

    assert.equal(updateForeignVendorResponse.body.code, "VENDOR_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to archive Vendor B.

    const archiveForeignVendorResponse = await agent.post(
      `/api/v1/organizations/${organizationAId}/vendors/${vendorBId}/archive`,
    );

    assert.equal(archiveForeignVendorResponse.status, 404);

    assert.equal(archiveForeignVendorResponse.body.code, "VENDOR_NOT_FOUND");

    //************************************************************** */
    // EMPLOYEE
    // Organization A must not be able to read Employee B.

    const getForeignEmployeeResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/employees/${employeeBId}`,
    );

    assert.equal(getForeignEmployeeResponse.status, 404);

    assert.equal(getForeignEmployeeResponse.body.code, "EMPLOYEE_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to update Employee B.

    const updateForeignEmployeeResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationAId}/employees/${employeeBId}`,
      )
      .send({
        firstName: "CrossTenantMutation",
      });

    assert.equal(updateForeignEmployeeResponse.status, 404);

    assert.equal(updateForeignEmployeeResponse.body.code, "EMPLOYEE_NOT_FOUND");

    //************************************************************** */
    // Organization A must not be able to deactivate Employee B.

    const deactivateForeignEmployeeResponse = await agent.post(
      `/api/v1/organizations/${organizationAId}/employees/${employeeBId}/deactivate`,
    );

    assert.equal(deactivateForeignEmployeeResponse.status, 404);

    assert.equal(
      deactivateForeignEmployeeResponse.body.code,
      "EMPLOYEE_NOT_FOUND",
    );

    //************************************************************** */
    // FOREIGN REFERENCE INJECTION
    //
    // Organization A must not be able to create a Vehicle A that
    // references Customer B.

    const foreignCustomerVehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/vehicles`)
      .send({
        customerId: customerBId,

        year: 2025,

        make: "Yamaha",

        model: `CrossTenant-${suffix}`,

        vin: `CROSS-TENANT-${suffix}`,

        mileage: 0,

        type: "MOTORCYCLE",

        classification: "SERVICE",

        inventoryStatus: "AVAILABLE",
      });

assert.equal(
  foreignCustomerVehicleResponse.status,
  400,
);

assert.equal(
  foreignCustomerVehicleResponse.body.code,
  "VEHICLE_CUSTOMER_INVALID",
);

    //************************************************************** */
    // LIST ISOLATION
    //
    // Foreign IDs must not leak through Organization A collection
    // endpoints.

    const customerListResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/customers`,
    );

    assert.equal(customerListResponse.status, 200);

    assert.equal(
      customerListResponse.body.data.some(
        (customer: { id: string }) => customer.id === customerBId,
      ),
      false,
    );

    const vehicleListResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/vehicles`,
    );

    assert.equal(vehicleListResponse.status, 200);

    assert.equal(
      vehicleListResponse.body.data.some(
        (vehicle: { id: string }) => vehicle.id === vehicleBId,
      ),
      false,
    );

    const partListResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/parts`,
    );

    assert.equal(partListResponse.status, 200);

    assert.equal(
      partListResponse.body.data.some(
        (part: { id: string }) => part.id === partBId,
      ),
      false,
    );

    const vendorListResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/vendors`,
    );

    assert.equal(vendorListResponse.status, 200);

    assert.equal(
      vendorListResponse.body.data.some(
        (vendor: { id: string }) => vendor.id === vendorBId,
      ),
      false,
    );

    const employeeListResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/employees`,
    );

    assert.equal(employeeListResponse.status, 200);

    assert.equal(
      employeeListResponse.body.data.some(
        (employee: { id: string }) => employee.id === employeeBId,
      ),
      false,
    );

    //************************************************************** */
    // DATABASE INVARIANTS
    //
    // API rejection alone is insufficient. Confirm Organization B's
    // records were not mutated by any Organization A request.

    const storedCustomer = await prisma.customer.findUniqueOrThrow({
      where: {
        id: customerBId,
      },
    });

    assert.equal(storedCustomer.organizationId, organizationBId);

    assert.equal(storedCustomer.phone, "3375554100");

    assert.equal(storedCustomer.notes, null);

    assert.equal(storedCustomer.isActive, true);

    //************************************************************** */

    const storedVehicle = await prisma.vehicle.findUniqueOrThrow({
      where: {
        id: vehicleBId,
      },
    });

    assert.equal(storedVehicle.organizationId, organizationBId);

    assert.equal(storedVehicle.customerId, customerBId);

    assert.equal(Number(storedVehicle.mileage), 10);

    assert.equal(
      storedVehicle.notes,
      "Organization B tenant-isolation vehicle.",
    );

    assert.equal(storedVehicle.isActive, true);

    //************************************************************** */

    const storedPart = await prisma.part.findUniqueOrThrow({
      where: {
        id: partBId,
      },
    });

    assert.equal(storedPart.organizationId, organizationBId);

    assert.equal(
      storedPart.description,
      "Organization B tenant-isolation part",
    );

    assert.equal(Number(storedPart.sellPrice), 20);

    assert.equal(storedPart.isActive, true);

    //************************************************************** */

    const storedVendor = await prisma.vendor.findUniqueOrThrow({
      where: {
        id: vendorBId,
      },
    });

    assert.equal(storedVendor.organizationId, organizationBId);

    assert.equal(storedVendor.phone, "3375554200");

    assert.equal(storedVendor.notes, null);

    assert.equal(storedVendor.isActive, true);

    //************************************************************** */

    const storedEmployee = await prisma.employee.findUniqueOrThrow({
      where: {
        id: employeeBId,
      },
    });

    assert.equal(storedEmployee.organizationId, organizationBId);

    assert.equal(storedEmployee.firstName, "Foreign");

    assert.equal(storedEmployee.status, "ACTIVE");
  });
});
