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

describe("Sales tenant isolation integration", () => {
  it("prevents cross-organization sale access and foreign customer/part checkout references", async () => {
    const { agent, organizationId: organizationAId } =
      await createAuthenticatedAgent();

    const suffix = createSafeSuffix();

    //************************************************************** */
    // Organization B

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `Sales Tenant B ${suffix}`,
        slug: `sales-tenant-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId = organizationBResponse.body.data.id;

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
        lastName: `POS-Customer-${suffix}`,
      });

    assert.equal(customerBResponse.status, 201);

    const customerBId = customerBResponse.body.data.id;

    //************************************************************** */
    // Part B

    const partBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/parts`)
      .send({
        partNumber: `POS-TENANT-B-${suffix}`,

        description: "Organization B protected POS part",

        qtyOnHand: 10,

        costPrice: 10,

        sellPrice: 25,
      });

    assert.equal(partBResponse.status, 201);

    const partBId = partBResponse.body.data.id;

    //************************************************************** */
    // Sale B
    //
    // 2 x $25 = $50.

    const saleBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/sales`)
      .send({
        customerId: customerBId,

        taxRate: 0,

        lines: [
          {
            partId: partBId,
            quantity: 2,
          },
        ],

        payments: [
          {
            method: "CASH",
            amount: 50,
          },
        ],
      });

    assert.equal(saleBResponse.status, 201);

    const saleB = saleBResponse.body.data;

    const saleBId = saleB.id;

    const saleBLineId = saleB.lines[0].id;

    //************************************************************** */
    // Confirm B inventory was legitimately decremented.

    const partBAfterSale = await prisma.part.findUniqueOrThrow({
      where: {
        id: partBId,
      },
    });

    assert.equal(Number(partBAfterSale.qtyOnHand), 8);

    //************************************************************** */
    // ORGANIZATION A FIXTURES

    await switchOrganization(agent, organizationAId);

    //************************************************************** */
    // Customer A

    const customerAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Local",
        lastName: `POS-Customer-${suffix}`,
      });

    assert.equal(customerAResponse.status, 201);

    const customerAId = customerAResponse.body.data.id;

    //************************************************************** */
    // Part A

    const partAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/parts`)
      .send({
        partNumber: `POS-TENANT-A-${suffix}`,

        description: "Organization A protected POS part",

        qtyOnHand: 10,

        costPrice: 15,

        sellPrice: 30,
      });

    assert.equal(partAResponse.status, 201);

    const partAId = partAResponse.body.data.id;

    //************************************************************** */
    // READ ISOLATION
    //
    // Organization A cannot retrieve Organization B's sale.

    const foreignSaleReadResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/sales/${saleBId}`,
    );

    assert.equal(foreignSaleReadResponse.status, 404);

    assert.equal(foreignSaleReadResponse.body.code, "SALE_NOT_FOUND");

    //************************************************************** */
    // LIST ISOLATION

    const saleListResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/sales`,
    );

    assert.equal(saleListResponse.status, 200);

    assert.equal(
      saleListResponse.body.data.some(
        (sale: { id: string }) => sale.id === saleBId,
      ),
      false,
    );

    //************************************************************** */
    // CUSTOMER FILTER ISOLATION
    //
    // A foreign customer ID supplied as a list filter must not cause
    // Organization B sales to leak through Organization A's endpoint.

    const foreignCustomerFilterResponse = await agent
      .get(`/api/v1/organizations/${organizationAId}/sales`)
      .query({
        customerId: customerBId,
      });

    assert.equal(foreignCustomerFilterResponse.status, 200);

    assert.equal(
      foreignCustomerFilterResponse.body.data.some(
        (sale: { id: string }) => sale.id === saleBId,
      ),
      false,
    );

    //************************************************************** */
    // FOREIGN CUSTOMER INJECTION
    //
    // Valid Organization A part + Organization B customer.

    const partABeforeCustomerAttack = await prisma.part.findUniqueOrThrow({
      where: {
        id: partAId,
      },
    });

    const saleCountBeforeCustomerAttack = await prisma.sale.count({
      where: {
        organizationId: organizationAId,
      },
    });

    const foreignCustomerCheckoutResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/sales`)
      .send({
        customerId: customerBId,

        taxRate: 0,

        lines: [
          {
            partId: partAId,
            quantity: 1,
          },
        ],

        payments: [
          {
            method: "CASH",
            amount: 30,
          },
        ],
      });

    assert.equal(foreignCustomerCheckoutResponse.status, 400);

    assert.equal(
      foreignCustomerCheckoutResponse.body.code,
      "SALE_CUSTOMER_INVALID",
    );

    //************************************************************** */
    // Customer rejection must happen without inventory mutation.

    const partAAfterCustomerAttack = await prisma.part.findUniqueOrThrow({
      where: {
        id: partAId,
      },
    });

    assert.equal(
      Number(partAAfterCustomerAttack.qtyOnHand),
      Number(partABeforeCustomerAttack.qtyOnHand),
    );

    const saleCountAfterCustomerAttack = await prisma.sale.count({
      where: {
        organizationId: organizationAId,
      },
    });

    assert.equal(saleCountAfterCustomerAttack, saleCountBeforeCustomerAttack);

    //************************************************************** */
    // FOREIGN PART INJECTION
    //
    // Valid Organization A customer + Organization B part.

    const partBBeforeForeignPartAttack = await prisma.part.findUniqueOrThrow({
      where: {
        id: partBId,
      },
    });

    const foreignPartCheckoutResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/sales`)
      .send({
        customerId: customerAId,

        taxRate: 0,

        lines: [
          {
            partId: partBId,
            quantity: 1,
          },
        ],

        payments: [
          {
            method: "CASH",
            amount: 25,
          },
        ],
      });

    assert.equal(foreignPartCheckoutResponse.status, 400);

    assert.equal(foreignPartCheckoutResponse.body.code, "SALE_PART_INVALID");

    //************************************************************** */
    // Organization B inventory must remain untouched.

    const partBAfterForeignPartAttack = await prisma.part.findUniqueOrThrow({
      where: {
        id: partBId,
      },
    });

    assert.equal(
      Number(partBAfterForeignPartAttack.qtyOnHand),
      Number(partBBeforeForeignPartAttack.qtyOnHand),
    );

    //************************************************************** */
    // MIXED VALID + FOREIGN PART ATTACK
    //
    // The first line belongs to A and is valid.
    // The second line belongs to B.
    //
    // No sale or inventory transaction may be partially committed.

    const partABeforeMixedAttack = await prisma.part.findUniqueOrThrow({
      where: {
        id: partAId,
      },
    });

    const partBBeforeMixedAttack = await prisma.part.findUniqueOrThrow({
      where: {
        id: partBId,
      },
    });

    const saleCountBeforeMixedAttack = await prisma.sale.count({
      where: {
        organizationId: organizationAId,
      },
    });

    const inventoryTransactionCountBeforeMixed =
      await prisma.partInventoryTransaction.count({
        where: {
          OR: [
            {
              partId: partAId,
            },

            {
              partId: partBId,
            },
          ],
        },
      });

    const mixedCheckoutResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/sales`)
      .send({
        taxRate: 0,

        lines: [
          {
            partId: partAId,
            quantity: 1,
          },

          {
            partId: partBId,
            quantity: 1,
          },
        ],

        payments: [
          {
            method: "CASH",
            amount: 55,
          },
        ],
      });

    assert.equal(mixedCheckoutResponse.status, 400);

    assert.equal(mixedCheckoutResponse.body.code, "SALE_PART_INVALID");

    //************************************************************** */
    // Valid A line must not have been partially sold.

    const partAAfterMixedAttack = await prisma.part.findUniqueOrThrow({
      where: {
        id: partAId,
      },
    });

    assert.equal(
      Number(partAAfterMixedAttack.qtyOnHand),
      Number(partABeforeMixedAttack.qtyOnHand),
    );

    //************************************************************** */
    // B inventory must remain unchanged as well.

    const partBAfterMixedAttack = await prisma.part.findUniqueOrThrow({
      where: {
        id: partBId,
      },
    });

    assert.equal(
      Number(partBAfterMixedAttack.qtyOnHand),
      Number(partBBeforeMixedAttack.qtyOnHand),
    );

    //************************************************************** */
    // No Organization A sale was created.

    const saleCountAfterMixedAttack = await prisma.sale.count({
      where: {
        organizationId: organizationAId,
      },
    });

    assert.equal(saleCountAfterMixedAttack, saleCountBeforeMixedAttack);

    //************************************************************** */
    // No inventory transaction was created by the rejected checkout.

    const inventoryTransactionCountAfterMixed =
      await prisma.partInventoryTransaction.count({
        where: {
          OR: [
            {
              partId: partAId,
            },

            {
              partId: partBId,
            },
          ],
        },
      });

    assert.equal(
      inventoryTransactionCountAfterMixed,
      inventoryTransactionCountBeforeMixed,
    );

    //************************************************************** */
    // DATABASE INVARIANTS — Sale B

    const storedSaleB = await prisma.sale.findUniqueOrThrow({
      where: {
        id: saleBId,
      },

      include: {
        lines: true,
        payments: true,
      },
    });

    assert.equal(storedSaleB.organizationId, organizationBId);

    assert.equal(storedSaleB.customerId, customerBId);

    assert.equal(storedSaleB.status, "COMPLETED");

    assert.equal(Number(storedSaleB.total), 50);

    assert.equal(storedSaleB.lines.length, 1);

    assert.equal(storedSaleB.lines[0].id, saleBLineId);

    assert.equal(storedSaleB.lines[0].partId, partBId);

    assert.equal(Number(storedSaleB.lines[0].quantity), 2);

    assert.equal(Number(storedSaleB.lines[0].returnedQty), 0);

    assert.equal(storedSaleB.payments.length, 1);

    //************************************************************** */
    // No Organization A sale may reference Customer B.

    const crossTenantCustomerReference = await prisma.sale.findFirst({
      where: {
        organizationId: organizationAId,

        customerId: customerBId,
      },
    });

    assert.equal(crossTenantCustomerReference, null);

    //************************************************************** */
    // No Organization A sale line may reference Part B.

    const crossTenantPartReference = await prisma.saleLine.findFirst({
      where: {
        sale: {
          organizationId: organizationAId,
        },

        partId: partBId,
      },
    });

    assert.equal(crossTenantPartReference, null);
  });
});
