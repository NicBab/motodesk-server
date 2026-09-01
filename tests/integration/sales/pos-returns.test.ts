import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import {
  prisma,
} from "../../../src/config/prisma.js";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

describe(
  "POS return and refund integration",
  () => {
    it(
      "partially refunds a POS sale and returns inventory to stock",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        //************************************************************** */
        // Create part

        const partResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber:
                `POS-RETURN-${suffix}`,

              description:
                "POS partial return integration part",

              qtyOnHand:
                10,

              costPrice:
                10,

              sellPrice:
                25,

              location:
                "RET-A1",
            });

        assert.equal(
          partResponse.status,
          201,
        );

        const partId =
          partResponse.body.data.id;

        //************************************************************** */
        // Sell 2 @ $25 = $50

        const saleResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/sales`,
            )
            .send({
              taxRate:
                0,

              lines: [
                {
                  partId,

                  quantity:
                    2,
                },
              ],

              payments: [
                {
                  method:
                    "CASH",

                  amount:
                    50,
                },
              ],
            });

        assert.equal(
          saleResponse.status,
          201,
        );

        const sale =
          saleResponse.body.data;

        assert.equal(
          Number(
            sale.total,
          ),
          50,
        );

        assert.equal(
          Number(
            sale.lines[0].returnedQty,
          ),
          0,
        );

        const originalSaleLineId =
          sale.lines[0].id;

        //************************************************************** */
        // Return one part to inventory.

        const returnResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/sales/${sale.id}/returns`,
            )
            .send({
              reason:
                "WRONG_PART",

              disposition:
                "RETURN_TO_INVENTORY",

              lines: [
                {
                  originalSaleLineId,

                  quantity:
                    1,
                },
              ],

              payments: [
                {
                  method:
                    "CASH",

                  amount:
                    25,
                },
              ],
            });

        assert.equal(
          returnResponse.status,
          201,
        );

        const refund =
          returnResponse.body.data;

        assert.equal(
          refund.type,
          "REFUND",
        );

        assert.equal(
          refund.status,
          "COMPLETED",
        );

        assert.equal(
          refund.originalSaleId,
          sale.id,
        );

        assert.equal(
          refund.originalSaleNumber,
          sale.saleNumber,
        );

        assert.equal(
          refund.returnReason,
          "WRONG_PART",
        );

        assert.equal(
          refund.returnDisposition,
          "RETURN_TO_INVENTORY",
        );

        assert.equal(
          Number(
            refund.total,
          ),
          25,
        );

        assert.equal(
          refund.lines.length,
          1,
        );

        assert.equal(
          refund.lines[0].originalSaleLineId,
          originalSaleLineId,
        );

        assert.equal(
          Number(
            refund.lines[0].quantity,
          ),
          1,
        );

        //************************************************************** */
        // Original sale should remain completed after partial refund.

        const originalAfterResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/sales/${sale.id}`,
          );

        assert.equal(
          originalAfterResponse.status,
          200,
        );

        const originalAfter =
          originalAfterResponse.body.data;

        assert.equal(
          originalAfter.status,
          "COMPLETED",
        );

        assert.equal(
          Number(
            originalAfter.refundedTotal,
          ),
          25,
        );

        assert.equal(
          Number(
            originalAfter.lines[0].returnedQty,
          ),
          1,
        );

        //************************************************************** */
        // Inventory should be restored from 8 to 9.

        const partAfter =
          await prisma.part.findUniqueOrThrow({
            where: {
              id:
                partId,
            },
          });

        assert.equal(
          Number(
            partAfter.qtyOnHand,
          ),
          9,
        );

        const returnTransaction =
          await prisma.partInventoryTransaction.findFirst({
            where: {
              partId,

              type:
                "RETURN",

              referenceType:
                "SALE_RETURN",

              referenceId:
                refund.id,
            },
          });

        assert.ok(
          returnTransaction,
        );

        assert.equal(
          Number(
            returnTransaction.quantity,
          ),
          1,
        );

        assert.equal(
          Number(
            returnTransaction.onHandBefore,
          ),
          8,
        );

        assert.equal(
          Number(
            returnTransaction.onHandAfter,
          ),
          9,
        );
      },
    );

    //************************************************************** */

    it(
      "records a non-resellable return without increasing inventory",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        const partResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber:
                `POS-SCRAP-${suffix}`,

              description:
                "POS scrap return integration part",

              qtyOnHand:
                5,

              costPrice:
                10,

              sellPrice:
                30,
            });

        assert.equal(
          partResponse.status,
          201,
        );

        const partId =
          partResponse.body.data.id;

        const saleResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/sales`,
            )
            .send({
              lines: [
                {
                  partId,

                  quantity:
                    1,
                },
              ],

              payments: [
                {
                  method:
                    "CREDIT_CARD",

                  amount:
                    30,
                },
              ],
            });

        assert.equal(
          saleResponse.status,
          201,
        );

        const sale =
          saleResponse.body.data;

        const qtyAfterSale =
          await prisma.part.findUniqueOrThrow({
            where: {
              id:
                partId,
            },
          });

        assert.equal(
          Number(
            qtyAfterSale.qtyOnHand,
          ),
          4,
        );

        const returnResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/sales/${sale.id}/returns`,
            )
            .send({
              reason:
                "DEFECTIVE_PART",

              disposition:
                "SCRAP_NON_RESELLABLE",

              lines: [
                {
                  originalSaleLineId:
                    sale.lines[0].id,

                  quantity:
                    1,
                },
              ],

              payments: [
                {
                  method:
                    "CREDIT_CARD",

                  amount:
                    30,
                },
              ],
            });

        assert.equal(
          returnResponse.status,
          201,
        );

        const refund =
          returnResponse.body.data;

        assert.equal(
          refund.returnDisposition,
          "SCRAP_NON_RESELLABLE",
        );

        const qtyAfterReturn =
          await prisma.part.findUniqueOrThrow({
            where: {
              id:
                partId,
            },
          });

        assert.equal(
          Number(
            qtyAfterReturn.qtyOnHand,
          ),
          4,
        );

        const returnTransactions =
          await prisma.partInventoryTransaction.count({
            where: {
              partId,

              type:
                "RETURN",

              referenceType:
                "SALE_RETURN",

              referenceId:
                refund.id,
            },
          });

        assert.equal(
          returnTransactions,
          0,
        );
      },
    );

    //************************************************************** */

    it(
      "marks the original sale REFUNDED after the entire sale is returned",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        const partResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber:
                `POS-FULL-REFUND-${suffix}`,

              description:
                "POS full refund integration part",

              qtyOnHand:
                3,

              costPrice:
                5,

              sellPrice:
                40,
            });

        assert.equal(
          partResponse.status,
          201,
        );

        const saleResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/sales`,
            )
            .send({
              lines: [
                {
                  partId:
                    partResponse.body.data.id,

                  quantity:
                    1,
                },
              ],

              payments: [
                {
                  method:
                    "DEBIT_CARD",

                  amount:
                    40,
                },
              ],
            });

        assert.equal(
          saleResponse.status,
          201,
        );

        const sale =
          saleResponse.body.data;

        const returnResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/sales/${sale.id}/returns`,
            )
            .send({
              reason:
                "CUSTOMER_CANCELLED",

              disposition:
                "RETURN_TO_INVENTORY",

              lines: [
                {
                  originalSaleLineId:
                    sale.lines[0].id,

                  quantity:
                    1,
                },
              ],

              payments: [
                {
                  method:
                    "DEBIT_CARD",

                  amount:
                    40,
                },
              ],
            });

        assert.equal(
          returnResponse.status,
          201,
        );

        const originalAfterResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/sales/${sale.id}`,
          );

        assert.equal(
          originalAfterResponse.status,
          200,
        );

        assert.equal(
          originalAfterResponse.body.data.status,
          "REFUNDED",
        );

        assert.equal(
          Number(
            originalAfterResponse.body.data.refundedTotal,
          ),
          40,
        );

        assert.equal(
          Number(
            originalAfterResponse.body.data.lines[0].returnedQty,
          ),
          1,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects returning more than the remaining sold quantity without changing inventory",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        const partResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber:
                `POS-OVERRETURN-${suffix}`,

              description:
                "POS over-return integration part",

              qtyOnHand:
                4,

              costPrice:
                8,

              sellPrice:
                20,
            });

        assert.equal(
          partResponse.status,
          201,
        );

        const partId =
          partResponse.body.data.id;

        const saleResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/sales`,
            )
            .send({
              lines: [
                {
                  partId,

                  quantity:
                    1,
                },
              ],

              payments: [
                {
                  method:
                    "CASH",

                  amount:
                    20,
                },
              ],
            });

        assert.equal(
          saleResponse.status,
          201,
        );

        const sale =
          saleResponse.body.data;

        const before =
          await prisma.part.findUniqueOrThrow({
            where: {
              id:
                partId,
            },
          });

        const returnResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/sales/${sale.id}/returns`,
            )
            .send({
              reason:
                "WRONG_PART",

              disposition:
                "RETURN_TO_INVENTORY",

              lines: [
                {
                  originalSaleLineId:
                    sale.lines[0].id,

                  quantity:
                    2,
                },
              ],

              payments: [
                {
                  method:
                    "CASH",

                  amount:
                    40,
                },
              ],
            });

        assert.equal(
          returnResponse.status,
          400,
        );

        assert.equal(
          returnResponse.body.success,
          false,
        );

        const after =
          await prisma.part.findUniqueOrThrow({
            where: {
              id:
                partId,
            },
          });

        assert.equal(
          Number(
            after.qtyOnHand,
          ),
          Number(
            before.qtyOnHand,
          ),
        );

        const originalAfter =
          await prisma.sale.findUniqueOrThrow({
            where: {
              id:
                sale.id,
            },

            include: {
              lines:
                true,
            },
          });

        assert.equal(
          Number(
            originalAfter.refundedTotal,
          ),
          0,
        );

        assert.equal(
          Number(
            originalAfter.lines[0].returnedQty,
          ),
          0,
        );

        const refundCount =
          await prisma.sale.count({
            where: {
              organizationId,

              originalSaleId:
                sale.id,

              type:
                "REFUND",
            },
          });

        assert.equal(
          refundCount,
          0,
        );
      },
    );
  },
);

//************************************************************** */
