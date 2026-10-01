import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../integration/helpers/authenticated-agent.js";

//************************************************************** */

describe("Mass-assignment security", () => {
  it("does not allow protected customer fields to be injected during creation", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const attackerOrganizationId = randomUUID();

    const attackerCustomerId = randomUUID();

    const attackerCreatedAt = "2000-01-01T00:00:00.000Z";

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Mass",

        lastName: "Assignment",

        email: `mass-assignment-${randomUUID()}@motodesk.local`,

        //******************************************************** */
        // Server-controlled / schema-unknown fields.

        id: attackerCustomerId,

        organizationId: attackerOrganizationId,

        isActive: false,

        createdAt: attackerCreatedAt,

        updatedAt: attackerCreatedAt,
      });

    assert.equal(response.status, 201);

    assert.equal(response.body.success, true);

    const customer = response.body.data;

    assert.notEqual(customer.id, attackerCustomerId);

    assert.equal(customer.organizationId, organizationId);

    assert.notEqual(customer.organizationId, attackerOrganizationId);

    assert.equal(customer.isActive, true);

    assert.notEqual(customer.createdAt, attackerCreatedAt);
  });

  //************************************************************** */

  it("does not allow protected customer fields to be changed through update", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Protected",

        lastName: "Customer",
      });

    assert.equal(createResponse.status, 201);

    const customerId = createResponse.body.data.id;

    const originalCreatedAt = createResponse.body.data.createdAt;

    const attackerOrganizationId = randomUUID();

    const attackerCustomerId = randomUUID();

    const response = await agent
      .patch(`/api/v1/organizations/${organizationId}/customers/${customerId}`)
      .send({
        firstName: "Updated",

        id: attackerCustomerId,

        organizationId: attackerOrganizationId,

        isActive: false,

        createdAt: "2000-01-01T00:00:00.000Z",

        updatedAt: "2000-01-01T00:00:00.000Z",
      });

    assert.equal(response.status, 200);

    const customer = response.body.data;

    assert.equal(customer.firstName, "Updated");

    assert.equal(customer.id, customerId);

    assert.equal(customer.organizationId, organizationId);

    assert.notEqual(customer.organizationId, attackerOrganizationId);

    assert.equal(customer.isActive, true);

    assert.equal(customer.createdAt, originalCreatedAt);
  });

  //************************************************************** */

  it("does not allow protected vehicle fields to be injected during creation", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Vehicle",

        lastName: "Owner",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    const attackerOrganizationId = randomUUID();

    const attackerVehicleId = randomUUID();

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        year: 2026,

        make: "Yamaha",

        model: "YZ450F",

        classification: "SERVICE",

        inventoryStatus: "AVAILABLE",

        id: attackerVehicleId,

        organizationId: attackerOrganizationId,

        isActive: false,

        createdAt: "2000-01-01T00:00:00.000Z",

        updatedAt: "2000-01-01T00:00:00.000Z",
      });

    assert.equal(response.status, 201);

    const vehicle = response.body.data;

    assert.notEqual(vehicle.id, attackerVehicleId);

    assert.equal(vehicle.organizationId, organizationId);

    assert.notEqual(vehicle.organizationId, attackerOrganizationId);

    assert.equal(vehicle.isActive, true);
  });

  //************************************************************** */

  it("does not allow protected vehicle fields to be changed through update", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        year: 2026,

        make: "Honda",

        model: "CRF450R",

        classification: "SERVICE",

        inventoryStatus: "AVAILABLE",
      });

    assert.equal(createResponse.status, 201);

    const vehicleId = createResponse.body.data.id;

    const originalCreatedAt = createResponse.body.data.createdAt;

    const attackerOrganizationId = randomUUID();

    const attackerVehicleId = randomUUID();

    const response = await agent
      .patch(`/api/v1/organizations/${organizationId}/vehicles/${vehicleId}`)
      .send({
        mileage: 100,

        id: attackerVehicleId,

        organizationId: attackerOrganizationId,

        isActive: false,

        createdAt: "2000-01-01T00:00:00.000Z",

        updatedAt: "2000-01-01T00:00:00.000Z",
      });

    assert.equal(response.status, 200);

    const vehicle = response.body.data;

    assert.equal(vehicle.mileage, 100);

    assert.equal(vehicle.id, vehicleId);

    assert.equal(vehicle.organizationId, organizationId);

    assert.notEqual(vehicle.organizationId, attackerOrganizationId);

    assert.equal(vehicle.isActive, true);

    assert.equal(vehicle.createdAt, originalCreatedAt);
  });
});

//************************************************************** */
