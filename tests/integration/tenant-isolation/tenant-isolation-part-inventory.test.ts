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

describe("Part inventory tenant isolation integration", () => {
  it("prevents Organization A from reading or mutating Organization B inventory", async () => {
    const { agent, organizationId: organizationAId } =
      await createAuthenticatedAgent();

    const suffix = createSafeSuffix();

    //************************************************************** */
    // Organization B

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `Inventory Tenant B ${suffix}`,

        slug: `inventory-tenant-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId = organizationBResponse.body.data.id;

    //************************************************************** */
    // Create protected Part B.

    await switchOrganization(agent, organizationBId);

    const partBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/parts`)
      .send({
        partNumber: `INV-TENANT-B-${suffix}`,

        description: "Organization B protected inventory",

        qtyOnHand: 20,

        reorderPoint: 2,

        costPrice: 10,

        sellPrice: 20,
      });

    assert.equal(partBResponse.status, 201);

    const partBId = partBResponse.body.data.id;

    //************************************************************** */
    // Establish some allocated stock so deallocate/issue attacks
    // would be capable of changing real state if isolation failed.

    const allocationResponse = await agent
      .post(
        `/api/v1/organizations/${organizationBId}/parts/${partBId}/inventory/allocate`,
      )
      .send({
        quantity: 5,

        referenceType: "SECURITY_TEST",

        referenceId: `ORG-B-${suffix}`,
      });

    assert.equal(allocationResponse.status, 200);

    //************************************************************** */
    // Capture Organization B state before attacks.

    const initialPartB = await prisma.part.findUniqueOrThrow({
      where: {
        id: partBId,
      },
    });

    assert.equal(Number(initialPartB.qtyOnHand), 20);

    assert.equal(Number(initialPartB.qtyAllocated), 5);

    const initialTransactionCount = await prisma.partInventoryTransaction.count(
      {
        where: {
          partId: partBId,
        },
      },
    );

    //************************************************************** */
    // Switch back to Organization A.

    await switchOrganization(agent, organizationAId);

    //************************************************************** */
    // ADJUST

    const adjustResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/parts/${partBId}/inventory/adjust`,
      )
      .send({
        quantity: 100,

        notes: "CROSS TENANT ADJUSTMENT",
      });

    assert.equal(adjustResponse.status, 404);

    assert.equal(adjustResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // RECEIVE

    const receiveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/parts/${partBId}/inventory/receive`,
      )
      .send({
        quantity: 100,

        referenceType: "SECURITY_TEST",

        referenceId: "CROSS-TENANT-RECEIPT",
      });

    assert.equal(receiveResponse.status, 404);

    assert.equal(receiveResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // ALLOCATE

    const allocateResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/parts/${partBId}/inventory/allocate`,
      )
      .send({
        quantity: 1,

        referenceType: "SECURITY_TEST",

        referenceId: "CROSS-TENANT-ALLOCATION",
      });

    assert.equal(allocateResponse.status, 404);

    assert.equal(allocateResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // DEALLOCATE

    const deallocateResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/parts/${partBId}/inventory/deallocate`,
      )
      .send({
        quantity: 1,

        referenceType: "SECURITY_TEST",

        referenceId: "CROSS-TENANT-DEALLOCATION",
      });

    assert.equal(deallocateResponse.status, 404);

    assert.equal(deallocateResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // ISSUE

    const issueResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/parts/${partBId}/inventory/issue`,
      )
      .send({
        quantity: 1,

        referenceType: "SECURITY_TEST",

        referenceId: "CROSS-TENANT-ISSUE",
      });

    assert.equal(issueResponse.status, 404);

    assert.equal(issueResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // RETURN TO INVENTORY

    const returnResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/parts/${partBId}/inventory/return`,
      )
      .send({
        quantity: 1,

        notes: "CROSS TENANT RETURN",
      });

    assert.equal(returnResponse.status, 404);

    assert.equal(returnResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // DAMAGE

    const damageResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/parts/${partBId}/inventory/damage`,
      )
      .send({
        quantity: 1,

        notes: "CROSS TENANT DAMAGE",
      });

    assert.equal(damageResponse.status, 404);

    assert.equal(damageResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // CYCLE COUNT
    //
    // This is particularly important because a successful attack
    // could directly overwrite the physical on-hand count.

    const cycleCountResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/parts/${partBId}/inventory/cycle-count`,
      )
      .send({
        countedQuantity: 999,

        notes: "CROSS TENANT CYCLE COUNT",
      });

    assert.equal(cycleCountResponse.status, 404);

    assert.equal(cycleCountResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // TRANSACTION HISTORY READ
    //
    // Organization A must not be able to enumerate Organization B's
    // inventory ledger.

    const transactionListResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/parts/${partBId}/inventory/transactions`,
    );

    assert.equal(transactionListResponse.status, 404);

    assert.equal(transactionListResponse.body.code, "PART_NOT_FOUND");

    //************************************************************** */
    // DATABASE INVARIANTS
    //
    // None of the rejected Organization A operations may alter
    // Organization B's physical or allocated inventory.

    const storedPartB = await prisma.part.findUniqueOrThrow({
      where: {
        id: partBId,
      },
    });

    assert.equal(storedPartB.organizationId, organizationBId);

    assert.equal(Number(storedPartB.qtyOnHand), Number(initialPartB.qtyOnHand));

    assert.equal(
      Number(storedPartB.qtyAllocated),
      Number(initialPartB.qtyAllocated),
    );

    assert.equal(
      Number(storedPartB.qtyOnOrder),
      Number(initialPartB.qtyOnOrder),
    );

    //************************************************************** */
    // No ledger records may have been created by rejected attacks.

    const finalTransactionCount = await prisma.partInventoryTransaction.count({
      where: {
        partId: partBId,
      },
    });

    assert.equal(finalTransactionCount, initialTransactionCount);

    //************************************************************** */
    // No Organization A inventory transaction may reference Part B.

    const crossTenantTransaction =
      await prisma.partInventoryTransaction.findFirst({
        where: {
          partId: partBId,

          createdByMembership: {
            organizationId: organizationAId,
          },
        },
      });

    assert.equal(crossTenantTransaction, null);
  });
});
