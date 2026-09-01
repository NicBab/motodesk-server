import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("POS checkout integration", () => {
  it("completes a walk-in sale, decrements inventory, records payment, and creates a SALE inventory transaction", async () => {
    const { agent, organizationId, membershipId } =
      await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const partNumber = `POS-WALKIN-${suffix}`;

    //************************************************************** */
    // Part

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber,

        description: "POS walk-in integration part",

        qtyOnHand: 10,

        reorderPoint: 2,

        costPrice: 5,

        sellPrice: 20,

        location: "POS-A1",
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

    //************************************************************** */
    // Checkout
    //
    // 2 x $20 = $40
    // $5 discount = $35 taxable
    // 10% tax = $3.50
    // total = $38.50

    const saleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/sales`)
      .send({
        taxRate: 10,

        discountAmount: 5,

        discountReason: "POS integration test",

        lines: [
          {
            partId,

            quantity: 2,
          },
        ],

        payments: [
          {
            method: "CASH",

            amount: 38.5,
          },
        ],
      });

    assert.equal(saleResponse.status, 201);

    assert.equal(saleResponse.body.success, true);

    const sale = saleResponse.body.data;

    assert.equal(sale.type, "POS");

    assert.equal(sale.status, "COMPLETED");

    assert.equal(sale.customerId, null);

    assert.equal(sale.customerName, "Walk-in");

    assert.equal(Number(sale.subtotal), 40);

    assert.equal(Number(sale.discountAmount), 5);

    assert.equal(Number(sale.taxRate), 10);

    assert.equal(Number(sale.taxAmount), 3.5);

    assert.equal(Number(sale.total), 38.5);

    assert.equal(sale.paymentMethod, "CASH");

    assert.equal(sale.cashierMembershipId, membershipId);

    assert.equal(sale.lines.length, 1);

    assert.equal(sale.lines[0].partId, partId);

    assert.equal(Number(sale.lines[0].quantity), 2);

    assert.equal(Number(sale.lines[0].unitPrice), 20);

    assert.equal(sale.payments.length, 1);

    assert.equal(sale.payments[0].method, "CASH");

    assert.equal(Number(sale.payments[0].amount), 38.5);

    //************************************************************** */
    // Inventory

    const partAfter = await prisma.part.findUniqueOrThrow({
      where: {
        id: partId,
      },
    });

    assert.equal(Number(partAfter.qtyOnHand), 8);

    const inventoryTransaction =
      await prisma.partInventoryTransaction.findFirst({
        where: {
          partId,

          type: "SALE",

          referenceType: "SALE",

          referenceId: sale.id,
        },
      });

    assert.ok(inventoryTransaction);

    assert.equal(Number(inventoryTransaction.quantity), 2);

    assert.equal(Number(inventoryTransaction.onHandBefore), 10);

    assert.equal(Number(inventoryTransaction.onHandAfter), 8);

    //************************************************************** */
    // Get Sale

    const getResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/sales/${sale.id}`,
    );

    assert.equal(getResponse.status, 200);

    assert.equal(getResponse.body.data.id, sale.id);
  });

  //************************************************************** */

  it("supports a customer sale, honors tax-exempt status, and records split payments", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Tax-exempt customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "BUSINESS",

        companyName: `POS Tax Exempt ${suffix}`,

        taxExempt: true,
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    //************************************************************** */
    // Part

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `POS-SPLIT-${suffix}`,

        description: "POS split payment test part",

        qtyOnHand: 4,

        costPrice: 20,

        sellPrice: 50,
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

    //************************************************************** */
    // $50 total, supplied tax rate should be ignored because customer
    // is tax exempt.

    const saleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/sales`)
      .send({
        customerId,

        taxRate: 9.45,

        lines: [
          {
            partId,

            quantity: 1,
          },
        ],

        payments: [
          {
            method: "CASH",

            amount: 20,
          },

          {
            method: "CREDIT_CARD",

            amount: 30,

            reference: "TEST-AUTH-123",
          },
        ],
      });

    assert.equal(saleResponse.status, 201);

    const sale = saleResponse.body.data;

    assert.equal(sale.customerId, customerId);

    assert.equal(sale.customerName, `POS Tax Exempt ${suffix}`);

    assert.equal(Number(sale.subtotal), 50);

    assert.equal(Number(sale.taxRate), 0);

    assert.equal(Number(sale.taxAmount), 0);

    assert.equal(Number(sale.total), 50);

    assert.equal(sale.paymentMethod, "SPLIT");

    assert.equal(sale.payments.length, 2);

    const paymentTotal = sale.payments.reduce(
      (
        sum: number,
        payment: {
          amount: string;
        },
      ) => sum + Number(payment.amount),
      0,
    );

    assert.equal(paymentTotal, 50);
  });

  //************************************************************** */

  it("rejects payment totals that do not equal the sale total without decrementing inventory", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `POS-PAYMENT-${suffix}`,

        description: "POS payment mismatch part",

        qtyOnHand: 3,

        costPrice: 4,

        sellPrice: 15,
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

    const before = await prisma.part.findUniqueOrThrow({
      where: {
        id: partId,
      },
    });

    const saleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/sales`)
      .send({
        taxRate: 0,

        lines: [
          {
            partId,

            quantity: 1,
          },
        ],

        payments: [
          {
            method: "CASH",

            amount: 10,
          },
        ],
      });

    assert.equal(saleResponse.status, 400);

    assert.equal(saleResponse.body.success, false);

    const after = await prisma.part.findUniqueOrThrow({
      where: {
        id: partId,
      },
    });

    assert.equal(Number(after.qtyOnHand), Number(before.qtyOnHand));

    const saleCount = await prisma.sale.count({
      where: {
        organizationId,

        lines: {
          some: {
            partId,
          },
        },
      },
    });

    assert.equal(saleCount, 0);
  });

  //************************************************************** */

  it("rejects overselling stock without creating a sale or inventory transaction", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const partResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `POS-OVERSELL-${suffix}`,

        description: "POS oversell test part",

        qtyOnHand: 1,

        costPrice: 5,

        sellPrice: 25,
      });

    assert.equal(partResponse.status, 201);

    const partId = partResponse.body.data.id;

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

    assert.equal(saleResponse.status, 400);

    assert.equal(saleResponse.body.success, false);

    const partAfter = await prisma.part.findUniqueOrThrow({
      where: {
        id: partId,
      },
    });

    assert.equal(Number(partAfter.qtyOnHand), 1);

    const saleCount = await prisma.sale.count({
      where: {
        organizationId,

        lines: {
          some: {
            partId,
          },
        },
      },
    });

    assert.equal(saleCount, 0);

    const saleTransactions = await prisma.partInventoryTransaction.count({
      where: {
        partId,

        type: "SALE",
      },
    });

    assert.equal(saleTransactions, 0);
  });

  //************************************************************** */

  it("allocates sequential sale numbers within the organization", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const firstPartResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `POS-SEQ-A-${suffix}`,

        description: "POS sequence A",

        qtyOnHand: 1,

        costPrice: 2,

        sellPrice: 10,
      });

    const secondPartResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/parts`)
      .send({
        partNumber: `POS-SEQ-B-${suffix}`,

        description: "POS sequence B",

        qtyOnHand: 1,

        costPrice: 2,

        sellPrice: 10,
      });

    assert.equal(firstPartResponse.status, 201);

    assert.equal(secondPartResponse.status, 201);

    const firstSaleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/sales`)
      .send({
        lines: [
          {
            partId: firstPartResponse.body.data.id,

            quantity: 1,
          },
        ],

        payments: [
          {
            method: "CASH",

            amount: 10,
          },
        ],
      });

    const secondSaleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/sales`)
      .send({
        lines: [
          {
            partId: secondPartResponse.body.data.id,

            quantity: 1,
          },
        ],

        payments: [
          {
            method: "CASH",

            amount: 10,
          },
        ],
      });

    assert.equal(firstSaleResponse.status, 201);

    assert.equal(secondSaleResponse.status, 201);

    assert.equal(
      secondSaleResponse.body.data.saleNumber,
      firstSaleResponse.body.data.saleNumber + 1,
    );
  });
});

//************************************************************** */
