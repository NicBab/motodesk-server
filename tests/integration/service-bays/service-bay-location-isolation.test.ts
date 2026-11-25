
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

import { defaultShopLocationId } from "../helpers/service-bay-location.fixture.js";

//************************************************************** */

type AuthenticatedAgent = Awaited<
  ReturnType<typeof createAuthenticatedAgent>
>["agent"];

//************************************************************** */
// Create Location Scoped Repair Order

async function createRepairOrder(
  agent: AuthenticatedAgent,
  organizationId: string,
  shopLocationId: string,
  label: string,
) {
  const suffix = randomUUID();

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",
      firstName: label,
      lastName: "Location Test",
    });

  assert.equal(customerResponse.status, 201);

  const customerId = customerResponse.body.data.id;

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId,
      make: "Honda",
      model: "CRF450R",
      vin: `LOCATION-${suffix}`,
      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  const repairOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/repair-orders`)
    .send({
      customerId,
      vehicleId: vehicleResponse.body.data.id,
      complaint: `${label} location isolation test.`,
    });

  assert.equal(repairOrderResponse.status, 201);

  const repairOrderId = repairOrderResponse.body.data.id;

  const result = await prisma.repairOrder.updateMany({
    where: {
      id: repairOrderId,
      organizationId,
    },
    data: {
      shopLocationId,
    },
  });

  assert.equal(result.count, 1);

  return repairOrderId;
}

//************************************************************** */
// Create Location Scoped Service Bay

async function createServiceBay(
  agent: AuthenticatedAgent,
  organizationId: string,
  shopLocationId: string,
  name: string,
) {
  const response = await agent
    .post(`/api/v1/organizations/${organizationId}/service-bays`)
    .set("X-Shop-Location-Id", shopLocationId)
    .send({
      name,
      description: "Location isolation test bay.",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.organizationId, organizationId);
  assert.equal(response.body.data.shopLocationId, shopLocationId);

  return response.body.data.id as string;
}

//************************************************************** */
// Create Test Workspace

async function createLocationFixture() {
  const { agent, organizationId } =
    await createAuthenticatedAgent();

  const suffix = randomUUID().slice(0, 8);

  const shopAId =
    await defaultShopLocationId(organizationId);

  const shopB = await prisma.shopLocation.create({
    data: {
      organizationId,
      name: `Secondary Shop ${suffix}`,
      code: `SHOP-${suffix}`,
      timezone: "America/Chicago",
      isDefault: false,
      status: "ACTIVE",
    },
  });

  return {
    agent,
    organizationId,
    shopAId,
    shopBId: shopB.id,
    baseUrl: `/api/v1/organizations/${organizationId}/service-bays`,
  };
}

//************************************************************** */

describe("Service bay location isolation integration", () => {
  //************************************************************** */
  // Missing Location Context

  it("rejects requests without a shop location header", async () => {
    const { agent, baseUrl } =
      await createLocationFixture();

    const response = await agent.get(baseUrl);

    assert.equal(response.status, 400);

    assert.equal(
      response.body.code,
      "SHOP_LOCATION_ID_REQUIRED",
    );
  });

  //************************************************************** */
  // Invalid Location Context

  it("rejects an unknown shop location", async () => {
    const { agent, baseUrl } =
      await createLocationFixture();

    const response = await agent
      .get(baseUrl)
      .set("X-Shop-Location-Id", randomUUID());

    assert.equal(response.status, 403);

    assert.equal(
      response.body.code,
      "SHOP_LOCATION_ACCESS_DENIED",
    );
  });

  //************************************************************** */
  // Location List Isolation

  it("lists only service bays belonging to the selected shop", async () => {
    const {
      agent,
      organizationId,
      shopAId,
      shopBId,
      baseUrl,
    } = await createLocationFixture();

    const bayAId = await createServiceBay(
      agent,
      organizationId,
      shopAId,
      "Shop A Bay",
    );

    const bayBId = await createServiceBay(
      agent,
      organizationId,
      shopBId,
      "Shop B Bay",
    );

    const responseA = await agent
      .get(baseUrl)
      .set("X-Shop-Location-Id", shopAId);

    assert.equal(responseA.status, 200);

    const bayIdsA = responseA.body.data.map(
      (bay: { id: string }) => bay.id,
    );

    assert.equal(bayIdsA.includes(bayAId), true);
    assert.equal(bayIdsA.includes(bayBId), false);

    const responseB = await agent
      .get(baseUrl)
      .set("X-Shop-Location-Id", shopBId);

    assert.equal(responseB.status, 200);

    const bayIdsB = responseB.body.data.map(
      (bay: { id: string }) => bay.id,
    );

    assert.equal(bayIdsB.includes(bayBId), true);
    assert.equal(bayIdsB.includes(bayAId), false);
  });

  //************************************************************** */
  // Cross Location Status Mutation

  it("rejects status changes against a bay in another shop", async () => {
    const {
      agent,
      organizationId,
      shopAId,
      shopBId,
      baseUrl,
    } = await createLocationFixture();

    const bayBId = await createServiceBay(
      agent,
      organizationId,
      shopBId,
      "Protected Shop B Bay",
    );

    const response = await agent
      .post(`${baseUrl}/${bayBId}/status`)
      .set("X-Shop-Location-Id", shopAId)
      .send({
        status: "MAINTENANCE",
      });

    assert.equal(response.status, 404);

    assert.equal(
      response.body.code,
      "SERVICE_BAY_NOT_FOUND",
    );

    const storedBay = await prisma.serviceBay.findUniqueOrThrow({
      where: {
        id: bayBId,
      },
    });

    assert.equal(storedBay.status, "ACTIVE");
    assert.equal(storedBay.shopLocationId, shopBId);
  });

  //************************************************************** */
  // Cross Location Bay Injection

  it("rejects assigning a repair order to a bay in another shop", async () => {
    const {
      agent,
      organizationId,
      shopAId,
      shopBId,
      baseUrl,
    } = await createLocationFixture();

    const repairOrderAId = await createRepairOrder(
      agent,
      organizationId,
      shopAId,
      "Shop A",
    );

    const bayBId = await createServiceBay(
      agent,
      organizationId,
      shopBId,
      "Shop B Assignment Bay",
    );

    const response = await agent
      .post(`${baseUrl}/repair-orders/${repairOrderAId}/assign`)
      .set("X-Shop-Location-Id", shopAId)
      .send({
        serviceBayId: bayBId,
      });

    assert.equal(response.status, 404);

    assert.equal(
      response.body.code,
      "SERVICE_BAY_NOT_FOUND",
    );

    const assignmentCount =
      await prisma.serviceBayAssignment.count({
        where: {
          organizationId,
          repairOrderId: repairOrderAId,
        },
      });

    assert.equal(assignmentCount, 0);
  });

  //************************************************************** */
  // Cross Location Repair Order Injection

  it("rejects assigning a repair order belonging to another shop", async () => {
    const {
      agent,
      organizationId,
      shopAId,
      shopBId,
      baseUrl,
    } = await createLocationFixture();

    const repairOrderBId = await createRepairOrder(
      agent,
      organizationId,
      shopBId,
      "Shop B",
    );

    const bayAId = await createServiceBay(
      agent,
      organizationId,
      shopAId,
      "Shop A Assignment Bay",
    );

    const response = await agent
      .post(`${baseUrl}/repair-orders/${repairOrderBId}/assign`)
      .set("X-Shop-Location-Id", shopAId)
      .send({
        serviceBayId: bayAId,
      });

    assert.equal(response.status, 404);

    assert.equal(
      response.body.code,
      "REPAIR_ORDER_NOT_FOUND",
    );

    const assignmentCount =
      await prisma.serviceBayAssignment.count({
        where: {
          organizationId,
          repairOrderId: repairOrderBId,
        },
      });

    assert.equal(assignmentCount, 0);
  });

  //************************************************************** */
  // Cross Location Release Protection

  it("rejects releasing another shop's active assignment", async () => {
    const {
      agent,
      organizationId,
      shopAId,
      shopBId,
      baseUrl,
    } = await createLocationFixture();

    const repairOrderBId = await createRepairOrder(
      agent,
      organizationId,
      shopBId,
      "Protected Shop B",
    );

    const bayBId = await createServiceBay(
      agent,
      organizationId,
      shopBId,
      "Protected Release Bay",
    );

    const assignmentResponse = await agent
      .post(`${baseUrl}/repair-orders/${repairOrderBId}/assign`)
      .set("X-Shop-Location-Id", shopBId)
      .send({
        serviceBayId: bayBId,
      });

    assert.equal(assignmentResponse.status, 200);

    const assignmentId = assignmentResponse.body.data.id;

    const foreignReleaseResponse = await agent
      .post(`${baseUrl}/repair-orders/${repairOrderBId}/release`)
      .set("X-Shop-Location-Id", shopAId)
      .send({
        notes: "Cross-location release attempt.",
      });

    assert.equal(foreignReleaseResponse.status, 404);

    assert.equal(
      foreignReleaseResponse.body.code,
      "REPAIR_ORDER_NOT_FOUND",
    );

    const storedAssignment =
      await prisma.serviceBayAssignment.findUniqueOrThrow({
        where: {
          id: assignmentId,
        },
      });

    assert.equal(storedAssignment.status, "ACTIVE");
    assert.equal(storedAssignment.releasedAt, null);
    assert.equal(storedAssignment.serviceBayId, bayBId);
    assert.equal(storedAssignment.repairOrderId, repairOrderBId);

    // Verify the authorized shop can still release the assignment.

    const authorizedReleaseResponse = await agent
      .post(`${baseUrl}/repair-orders/${repairOrderBId}/release`)
      .set("X-Shop-Location-Id", shopBId)
      .send({
        notes: "Authorized release.",
      });

    assert.equal(authorizedReleaseResponse.status, 200);

    assert.equal(
      authorizedReleaseResponse.body.data.status,
      "RELEASED",
    );
  });

  //************************************************************** */
  // Archived Location Protection

  it("rejects access to an archived shop", async () => {
    const {
      agent,
      organizationId,
      shopBId,
      baseUrl,
    } = await createLocationFixture();

    await prisma.shopLocation.updateMany({
      where: {
        id: shopBId,
        organizationId,
      },
      data: {
        status: "ARCHIVED",
      },
    });

    const response = await agent
      .get(baseUrl)
      .set("X-Shop-Location-Id", shopBId);

    assert.equal(response.status, 403);

    assert.equal(
      response.body.code,
      "SHOP_LOCATION_ACCESS_DENIED",
    );
  });
});

//************************************************************** */
