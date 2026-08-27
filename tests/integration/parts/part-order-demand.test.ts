import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Part order demand integration", () => {
  it("returns unresolved RO part demand with correct quantity-to-order calculation", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Demand",

        lastName: "Customer",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        year: 2025,

        make: "Yamaha",

        model: "YZ250F",

        vin: `DEMAND-${suffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    //************************************************************** */
    // Repair Order

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,

        vehicleId,

        complaint: "Part order demand integration test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    const roNumber = repairOrderResponse.body.data.roNumber;

    //************************************************************** */
    // Inventory Part
    //
    // 5 on hand
    // 2 globally allocated
    //
    // Free inventory = 3.

    const partNumber = `DEMAND-PART-${suffix}`;

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber,

        description: "Demand integration test part",

        qtyOnHand: 5,

        costPrice: 10,

        sellPrice: 20,
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

    //************************************************************** */
    // Allocate 2 elsewhere so global free inventory is only 3.

    const allocationResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/allocate`,
      )
      .send({
        quantity: 2,

        referenceType: "TEST",

        referenceId: `DEMAND-OTHER-${suffix}`,
      });

    assert.equal(allocationResponse.status, 200);

    assert.equal(Number(allocationResponse.body.data.part.qtyAllocated), 2);

    //************************************************************** */
    // RO Part Line
    //
    // Required = 6
    // Approved = 6
    // Allocated to this line = 0
    // Ordered = 0
    // Free inventory = 3
    //
    // Expected qtyToOrder = 3.

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId,

        partNumber,

        description: "Demand integration test part",

        quantity: 6,

        requiredQty: 6,

        approvedQty: 6,

        unitPrice: 20,

        estimatedCost: 10,

        blocksWork: true,

        resolutionMethod: "ORIGINAL_PO",
      });

    assert.equal(partLineResponse.status, 201);

    const partLineId = partLineResponse.body.data.id;

    //************************************************************** */
    // Move line into TO_BE_ORDERED lifecycle state.

    const toBeOrderedResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/to-be-ordered`,
      )
      .send({});

    assert.equal(toBeOrderedResponse.status, 200);

    assert.equal(toBeOrderedResponse.body.data.status, "TO_BE_ORDERED");

    //************************************************************** */
    // Demand Queue

    const demandResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/order-demand`,
    );

    assert.equal(demandResponse.status, 200);

    assert.equal(demandResponse.body.success, true);

    const demand = demandResponse.body.data.find(
      (item: { partLineId: string }) => item.partLineId === partLineId,
    );

    assert.ok(demand);

    assert.equal(demand.repairOrderId, repairOrderId);

    assert.equal(demand.roNumber, roNumber);

    assert.equal(demand.customerName, "Demand Customer");

    assert.equal(demand.vehicleDescription, "2025 Yamaha YZ250F");

    assert.equal(demand.partId, partId);

    assert.equal(demand.partNumber, partNumber);

    assert.equal(demand.description, "Demand integration test part");

    assert.equal(demand.requiredQty, 6);

    assert.equal(demand.approvedQty, 6);

    assert.equal(demand.allocatedQty, 0);

    assert.equal(demand.orderedQty, 0);

    assert.equal(demand.availableQty, 3);

    assert.equal(demand.qtyToOrder, 3);

    assert.equal(demand.estimatedCost, 10);

    assert.equal(demand.status, "TO_BE_ORDERED");

    assert.equal(demand.blocksWork, true);

    assert.equal(demand.alreadyOnPurchaseOrder, false);

    assert.deepEqual(demand.purchaseOrderNumbers, []);
  });

  //************************************************************** */

  it("includes NEEDS_REVIEW lines even when inventory can satisfy demand", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "BUSINESS",

        companyName: `Demand Shop ${suffix}`,
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        make: "Honda",

        model: "CRF450R",

        vin: `DEMAND-REVIEW-${suffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    //************************************************************** */
    // Repair Order

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,

        vehicleId,

        complaint: "Needs review demand integration test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Plenty of stock

    const partNumber = `DEMAND-REVIEW-${suffix}`;

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber,

        description: "Needs review test part",

        qtyOnHand: 10,

        costPrice: 5,

        sellPrice: 10,
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

    //************************************************************** */
    // Part line remains NEEDS_REVIEW.

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId,

        partNumber,

        description: "Needs review test part",

        quantity: 1,

        requiredQty: 1,

        approvedQty: 1,

        unitPrice: 10,

        estimatedCost: 5,

        blocksWork: true,
      });

    assert.equal(partLineResponse.status, 201);

    const partLineId = partLineResponse.body.data.id;

    assert.equal(partLineResponse.body.data.status, "NEEDS_REVIEW");

    //************************************************************** */
    // Demand Queue

    const demandResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/parts/order-demand`,
    );

    assert.equal(demandResponse.status, 200);

    const demand = demandResponse.body.data.find(
      (item: { partLineId: string }) => item.partLineId === partLineId,
    );

    assert.ok(demand);

    assert.equal(demand.status, "NEEDS_REVIEW");

    assert.equal(demand.availableQty, 10);

    assert.equal(demand.qtyToOrder, 0);
  });

  //************************************************************** */

  it("filters demand by search", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        firstName: "Search",

        lastName: "Demand",
      });

    assert.equal(customerResponse.status, 201);

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId: customerResponse.body.data.id,

        make: "Kawasaki",

        model: "KX450",

        vin: `DEMAND-SEARCH-${suffix}`,
      });

    assert.equal(vehicleResponse.status, 201);

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId: customerResponse.body.data.id,

        vehicleId: vehicleResponse.body.data.id,
      });

    assert.equal(repairOrderResponse.status, 201);

    const partNumber = `SPECIAL-DEMAND-${suffix}`;

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber,

        description: "Searchable demand part",

        qtyOnHand: 0,

        costPrice: 5,

        sellPrice: 10,
      });

    assert.equal(partResponse.status, 201);

    const partLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderResponse.body.data.id}/part-lines`,
      )
      .send({
        partId: partResponse.body.data.id,

        partNumber,

        description: "Searchable demand part",

        quantity: 1,

        requiredQty: 1,

        approvedQty: 1,

        unitPrice: 10,

        estimatedCost: 5,

        resolutionMethod: "ORIGINAL_PO",
      });

    assert.equal(partLineResponse.status, 201);

    const partLineId = partLineResponse.body.data.id;

    const toBeOrderedResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderResponse.body.data.id}/part-lines/${partLineId}/to-be-ordered`,
      )
      .send({});

    assert.equal(toBeOrderedResponse.status, 200);

    //************************************************************** */

    const searchResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/parts/order-demand`)
      .query({
        search: "SPECIAL-DEMAND",
      });

    assert.equal(searchResponse.status, 200);

    assert.equal(
      searchResponse.body.data.some(
        (item: { partLineId: string }) => item.partLineId === partLineId,
      ),
      true,
    );

    //************************************************************** */
    // A search that cannot match this line should exclude it.

    const noMatchResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/parts/order-demand`)
      .query({
        search: `NO-MATCH-${suffix}`,
      });

    assert.equal(noMatchResponse.status, 200);

    assert.equal(
      noMatchResponse.body.data.some(
        (item: { partLineId: string }) => item.partLineId === partLineId,
      ),
      false,
    );
  });
});

//************************************************************** */
