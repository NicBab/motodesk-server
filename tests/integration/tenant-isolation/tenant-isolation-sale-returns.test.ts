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

async function createSaleFixture(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
) {
  const partResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/parts`)
    .send({
      partNumber: `RETURN-${label}-${suffix}`,
      description: `${label} protected return part`,
      qtyOnHand: 10,
      costPrice: 10,
      sellPrice: 25,
    });

  assert.equal(partResponse.status, 201);

  const partId = partResponse.body.data.id;

  //************************************************************** */

  const saleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/sales`)
    .send({
      taxRate: 0,

      lines: [
        {
          partId,
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

  assert.equal(saleResponse.status, 201);

  const sale = saleResponse.body.data;

  assert.equal(sale.type, "POS");
  assert.equal(sale.status, "COMPLETED");

  return {
    partId,
    saleId: sale.id,
    saleLineId: sale.lines[0].id,
  };
}

//************************************************************** */

describe("Sale return tenant isolation integration", () => {
  it("prevents foreign sale and sale-line return injection without refund or inventory side effects", async () => {
    const {
      agent,
      organizationId: organizationAId,
    } = await createAuthenticatedAgent();

    const suffix = createSafeSuffix();

    //************************************************************** */
    // Organization B

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `Return Tenant B ${suffix}`,
        slug: `return-tenant-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId =
      organizationBResponse.body.data.id;

    //************************************************************** */
    // Sale B

    await switchOrganization(
      agent,
      organizationBId,
    );

    const fixtureB =
      await createSaleFixture(
        agent,
        organizationBId,
        suffix,
        "B",
      );

    //************************************************************** */
    // Sale A

    await switchOrganization(
      agent,
      organizationAId,
    );

    const fixtureA =
      await createSaleFixture(
        agent,
        organizationAId,
        suffix,
        "A",
      );

    //************************************************************** */
    // Baseline state.
    //
    // Both parts started at 10 and each legitimate sale sold 2.

    const initialPartA =
      await prisma.part.findUniqueOrThrow({
        where: {
          id: fixtureA.partId,
        },
      });

    const initialPartB =
      await prisma.part.findUniqueOrThrow({
        where: {
          id: fixtureB.partId,
        },
      });

    assert.equal(
      Number(initialPartA.qtyOnHand),
      8,
    );

    assert.equal(
      Number(initialPartB.qtyOnHand),
      8,
    );

    const initialSaleLineA =
      await prisma.saleLine.findUniqueOrThrow({
        where: {
          id: fixtureA.saleLineId,
        },
      });

    const initialSaleLineB =
      await prisma.saleLine.findUniqueOrThrow({
        where: {
          id: fixtureB.saleLineId,
        },
      });

    assert.equal(
      Number(initialSaleLineA.returnedQty),
      0,
    );

    assert.equal(
      Number(initialSaleLineB.returnedQty),
      0,
    );

    const initialRefundCountA =
      await prisma.sale.count({
        where: {
          organizationId: organizationAId,
          type: "REFUND",
        },
      });

    const initialRefundCountB =
      await prisma.sale.count({
        where: {
          organizationId: organizationBId,
          type: "REFUND",
        },
      });

    //************************************************************** */
    // FOREIGN SALE RETURN
    //
    // Organization A cannot create a refund against Organization B's
    // sale even when the submitted line actually belongs to that sale.

    const foreignSaleReturnResponse =
      await agent
        .post(
          `/api/v1/organizations/${organizationAId}/sales/${fixtureB.saleId}/returns`,
        )
        .send({
          reason: "WRONG_PART",

          disposition:
            "RETURN_TO_INVENTORY",

          lines: [
            {
              originalSaleLineId:
                fixtureB.saleLineId,

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

    assert.equal(
      foreignSaleReturnResponse.status,
      404,
    );

    assert.equal(
      foreignSaleReturnResponse.body.code,
      "SALE_NOT_FOUND",
    );

    //************************************************************** */
    // FOREIGN SALE-LINE INJECTION
    //
    // The original sale belongs to Organization A, but the submitted
    // line belongs to Organization B.

    const foreignLineReturnResponse =
      await agent
        .post(
          `/api/v1/organizations/${organizationAId}/sales/${fixtureA.saleId}/returns`,
        )
        .send({
          reason: "WRONG_PART",

          disposition:
            "RETURN_TO_INVENTORY",

          lines: [
            {
              originalSaleLineId:
                fixtureB.saleLineId,

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

    assert.equal(
      foreignLineReturnResponse.status,
      400,
    );

    assert.equal(
      foreignLineReturnResponse.body.code,
      "SALE_RETURN_LINE_INVALID",
    );

    //************************************************************** */
    // MIXED VALID + FOREIGN RETURN
    //
    // The valid Organization A line is deliberately first.
    // The second line belongs to Organization B.
    //
    // Validation must reject the entire request before:
    // - returnedQty changes
    // - inventory is restored
    // - a REFUND Sale is created
    // - a refund payment is created
    // - an inventory transaction is created

    const inventoryTransactionCountBeforeMixed =
      await prisma.partInventoryTransaction.count({
        where: {
          OR: [
            {
              partId: fixtureA.partId,
            },
            {
              partId: fixtureB.partId,
            },
          ],
        },
      });

    const mixedReturnResponse =
      await agent
        .post(
          `/api/v1/organizations/${organizationAId}/sales/${fixtureA.saleId}/returns`,
        )
        .send({
          reason: "WRONG_PART",

          disposition:
            "RETURN_TO_INVENTORY",

          managerNotes:
            "Cross-tenant mixed return security test.",

          lines: [
            {
              originalSaleLineId:
                fixtureA.saleLineId,

              quantity: 1,
            },

            {
              originalSaleLineId:
                fixtureB.saleLineId,

              quantity: 1,
            },
          ],

          // The request will be rejected before refund calculation
          // reaches persistence, but the payment remains schema-valid.
          payments: [
            {
              method: "CASH",
              amount: 50,
            },
          ],
        });

    assert.equal(
      mixedReturnResponse.status,
      400,
    );

    assert.equal(
      mixedReturnResponse.body.code,
      "SALE_RETURN_LINE_INVALID",
    );

    //************************************************************** */
    // INVENTORY A UNCHANGED

    const storedPartA =
      await prisma.part.findUniqueOrThrow({
        where: {
          id: fixtureA.partId,
        },
      });

    assert.equal(
      Number(storedPartA.qtyOnHand),
      Number(initialPartA.qtyOnHand),
    );

    //************************************************************** */
    // INVENTORY B UNCHANGED

    const storedPartB =
      await prisma.part.findUniqueOrThrow({
        where: {
          id: fixtureB.partId,
        },
      });

    assert.equal(
      Number(storedPartB.qtyOnHand),
      Number(initialPartB.qtyOnHand),
    );

    //************************************************************** */
    // ORIGINAL SALE LINE A UNCHANGED

    const storedSaleLineA =
      await prisma.saleLine.findUniqueOrThrow({
        where: {
          id: fixtureA.saleLineId,
        },
      });

    assert.equal(
      storedSaleLineA.saleId,
      fixtureA.saleId,
    );

    assert.equal(
      Number(storedSaleLineA.returnedQty),
      Number(initialSaleLineA.returnedQty),
    );

    //************************************************************** */
    // ORIGINAL SALE LINE B UNCHANGED

    const storedSaleLineB =
      await prisma.saleLine.findUniqueOrThrow({
        where: {
          id: fixtureB.saleLineId,
        },
      });

    assert.equal(
      storedSaleLineB.saleId,
      fixtureB.saleId,
    );

    assert.equal(
      Number(storedSaleLineB.returnedQty),
      Number(initialSaleLineB.returnedQty),
    );

    //************************************************************** */
    // ORIGINAL SALE A REFUND TOTAL UNCHANGED

    const storedSaleA =
      await prisma.sale.findUniqueOrThrow({
        where: {
          id: fixtureA.saleId,
        },
      });

    assert.equal(
      storedSaleA.organizationId,
      organizationAId,
    );

    assert.equal(
      storedSaleA.status,
      "COMPLETED",
    );

    assert.equal(
      Number(storedSaleA.refundedTotal),
      0,
    );

    //************************************************************** */
    // ORIGINAL SALE B REFUND TOTAL UNCHANGED

    const storedSaleB =
      await prisma.sale.findUniqueOrThrow({
        where: {
          id: fixtureB.saleId,
        },
      });

    assert.equal(
      storedSaleB.organizationId,
      organizationBId,
    );

    assert.equal(
      storedSaleB.status,
      "COMPLETED",
    );

    assert.equal(
      Number(storedSaleB.refundedTotal),
      0,
    );

    //************************************************************** */
    // NO REFUND SALE CREATED FOR ORGANIZATION A

    const finalRefundCountA =
      await prisma.sale.count({
        where: {
          organizationId:
            organizationAId,

          type: "REFUND",
        },
      });

    assert.equal(
      finalRefundCountA,
      initialRefundCountA,
    );

    //************************************************************** */
    // NO REFUND SALE CREATED FOR ORGANIZATION B

    const finalRefundCountB =
      await prisma.sale.count({
        where: {
          organizationId:
            organizationBId,

          type: "REFUND",
        },
      });

    assert.equal(
      finalRefundCountB,
      initialRefundCountB,
    );

    //************************************************************** */
    // NO INVENTORY TRANSACTION CREATED BY REJECTED RETURNS

    const inventoryTransactionCountAfterMixed =
      await prisma.partInventoryTransaction.count({
        where: {
          OR: [
            {
              partId: fixtureA.partId,
            },
            {
              partId: fixtureB.partId,
            },
          ],
        },
      });

    assert.equal(
      inventoryTransactionCountAfterMixed,
      inventoryTransactionCountBeforeMixed,
    );

    //************************************************************** */
    // Explicitly prove no Organization A REFUND references Sale B.

    const crossTenantRefund =
      await prisma.sale.findFirst({
        where: {
          organizationId:
            organizationAId,

          type: "REFUND",

          originalSaleId:
            fixtureB.saleId,
        },
      });

    assert.equal(
      crossTenantRefund,
      null,
    );

    //************************************************************** */
    // Explicitly prove no Organization A refund line references
    // Organization B's original sale line.

    const crossTenantRefundLine =
      await prisma.saleLine.findFirst({
        where: {
          sale: {
            organizationId:
              organizationAId,

            type: "REFUND",
          },

          originalSaleLineId:
            fixtureB.saleLineId,
        },
      });

    assert.equal(
      crossTenantRefundLine,
      null,
    );
  });
});