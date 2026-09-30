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

async function createReturnFixture(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
) {
  //************************************************************** */
  // Vendor

  const vendorResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/vendors`,
    )
    .send({
      name: `${label} Return Vendor ${suffix}`,
    });

  assert.equal(vendorResponse.status, 201);

  const vendorId =
    vendorResponse.body.data.id;

  //************************************************************** */
  // Part

  const partNumber =
    `RETURN-${label}-${suffix}`;

  const partResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/parts`,
    )
    .send({
      partNumber,

      description:
        `${label} protected return part`,

      qtyOnHand: 10,

      costPrice: 10,

      sellPrice: 20,
    });

  assert.equal(partResponse.status, 201);

  const partId =
    partResponse.body.data.id;

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/customers`,
    )
    .send({
      type: "INDIVIDUAL",

      firstName: label,

      lastName:
        `Return-Customer-${suffix}`,
    });

  assert.equal(customerResponse.status, 201);

  const customerId =
    customerResponse.body.data.id;

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/vehicles`,
    )
    .send({
      customerId,

      make: "Honda",

      model: "CRF450R",

      vin:
        `RETURN-${label}-VIN-${suffix}`,

      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  const vehicleId =
    vehicleResponse.body.data.id;

  //************************************************************** */
  // Repair Order

  const repairOrderResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders`,
    )
    .send({
      customerId,

      vehicleId,

      complaint:
        `${label} protected part-return RO.`,
    });

  assert.equal(
    repairOrderResponse.status,
    201,
  );

  const repairOrderId =
    repairOrderResponse.body.data.id;

  //************************************************************** */
  // RO Part Line
  //
  // This makes the part legitimately related to this RO.

  const roPartLineResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
    )
    .send({
      partId,

      partNumber,

      description:
        `${label} protected return RO line`,

      quantity: 1,

      requiredQty: 1,

      approvedQty: 1,

      unitPrice: 20,

      resolutionMethod:
        "SHOP_INVENTORY",
    });

  assert.equal(
    roPartLineResponse.status,
    201,
  );

  //************************************************************** */
  // Purchase Order
  //
  // This makes the same part legitimately related to this PO.

  const purchaseOrderResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/purchase-orders`,
    )
    .send({
      vendorId,

      lines: [
        {
          partId,

          orderedQty: 1,

          unitCost: 10,
        },
      ],
    });

  assert.equal(
    purchaseOrderResponse.status,
    201,
  );

  const purchaseOrderId =
    purchaseOrderResponse.body.data.id;

  //************************************************************** */

  return {
    vendorId,

    partId,
    partNumber,

    customerId,
    vehicleId,

    repairOrderId,

    purchaseOrderId,
  };
}

//************************************************************** */

describe(
  "Part Return tenant isolation integration",
  () => {
    it(
      "prevents cross-organization Part Return access and foreign part, vendor, PO, and RO references",
      async () => {
        const {
          agent,
          organizationId:
            organizationAId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          createSafeSuffix();

        //************************************************************** */
        // Organization B

        const organizationBResponse =
          await agent
            .post(
              "/api/v1/organizations",
            )
            .send({
              name:
                `Part Return Tenant B ${suffix}`,

              slug:
                `part-return-tenant-b-${suffix}`,
            });

        assert.equal(
          organizationBResponse.status,
          201,
        );

        const organizationBId =
          organizationBResponse.body.data.id;

        //************************************************************** */
        // Organization B fixture

        await switchOrganization(
          agent,
          organizationBId,
        );

        const fixtureB =
          await createReturnFixture(
            agent,
            organizationBId,
            suffix,
            "B",
          );

        //************************************************************** */
        // Create a real Part Return B with all B relationships.

        const partReturnBResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationBId}/part-returns`,
            )
            .send({
              returnType:
                "TO_VENDOR",

              partId:
                fixtureB.partId,

              quantity:
                1,

              vendorId:
                fixtureB.vendorId,

              purchaseOrderId:
                fixtureB.purchaseOrderId,

              repairOrderId:
                fixtureB.repairOrderId,

              restockingFee:
                0,

              creditAmount:
                0,

              notes:
                "Organization B protected part return.",
            });

        assert.equal(
          partReturnBResponse.status,
          201,
        );

        const partReturnBId =
          partReturnBResponse.body.data.id;

        //************************************************************** */
        // Organization A fixture

        await switchOrganization(
          agent,
          organizationAId,
        );

        const fixtureA =
          await createReturnFixture(
            agent,
            organizationAId,
            suffix,
            "A",
          );

        //************************************************************** */
        // Create a local pending Part Return A.

        const partReturnAResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/part-returns`,
            )
            .send({
              returnType:
                "TO_VENDOR",

              partId:
                fixtureA.partId,

              quantity:
                1,

              vendorId:
                fixtureA.vendorId,

              purchaseOrderId:
                fixtureA.purchaseOrderId,

              repairOrderId:
                fixtureA.repairOrderId,

              restockingFee:
                0,

              creditAmount:
                0,

              notes:
                "Organization A protected part return.",
            });

        assert.equal(
          partReturnAResponse.status,
          201,
        );

        const partReturnAId =
          partReturnAResponse.body.data.id;

        //************************************************************** */
        // FOREIGN RETURN READ

        const foreignReadResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/part-returns/${partReturnBId}`,
          );

        assert.equal(
          foreignReadResponse.status,
          404,
        );

        assert.equal(
          foreignReadResponse.body.code,
          "PART_RETURN_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN RETURN UPDATE

        const foreignUpdateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationAId}/part-returns/${partReturnBId}`,
            )
            .send({
              quantity: 99,

              notes:
                "CROSS TENANT MUTATION",
            });

        assert.equal(
          foreignUpdateResponse.status,
          404,
        );

        assert.equal(
          foreignUpdateResponse.body.code,
          "PART_RETURN_NOT_FOUND",
        );

        //************************************************************** */
        // LIST ISOLATION

        const listResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/part-returns`,
          );

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.data.some(
            (
              partReturn: {
                id: string;
              },
            ) =>
              partReturn.id ===
              partReturnBId,
          ),
          false,
        );

        //************************************************************** */
        // FILTER ISOLATION
        //
        // Foreign IDs used as filters must not leak B's return.

        for (const query of [
          {
            partId:
              fixtureB.partId,
          },

          {
            vendorId:
              fixtureB.vendorId,
          },

          {
            purchaseOrderId:
              fixtureB.purchaseOrderId,
          },

          {
            repairOrderId:
              fixtureB.repairOrderId,
          },
        ]) {
          const response =
            await agent
              .get(
                `/api/v1/organizations/${organizationAId}/part-returns`,
              )
              .query(query);

          assert.equal(
            response.status,
            200,
          );

          assert.equal(
            response.body.data.some(
              (
                partReturn: {
                  id: string;
                },
              ) =>
                partReturn.id ===
                partReturnBId,
            ),
            false,
          );
        }

        //************************************************************** */
        // FOREIGN PART INJECTION — CREATE
        //
        // Use TO_INVENTORY so vendor validation cannot mask the part
        // boundary.

        const foreignPartResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/part-returns`,
            )
            .send({
              returnType:
                "TO_INVENTORY",

              partId:
                fixtureB.partId,

              quantity:
                1,
            });

        assert.equal(
          foreignPartResponse.status,
          400,
        );

        assert.equal(
          foreignPartResponse.body.code,
          "PART_RETURN_PART_INVALID",
        );

        //************************************************************** */
        // FOREIGN VENDOR INJECTION — CREATE

        const foreignVendorResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/part-returns`,
            )
            .send({
              returnType:
                "TO_VENDOR",

              partId:
                fixtureA.partId,

              quantity:
                1,

              vendorId:
                fixtureB.vendorId,
            });

        assert.equal(
          foreignVendorResponse.status,
          400,
        );

        assert.equal(
          foreignVendorResponse.body.code,
          "PART_RETURN_VENDOR_INVALID",
        );

        //************************************************************** */
        // FOREIGN PURCHASE ORDER INJECTION — CREATE

        const foreignPurchaseOrderResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/part-returns`,
            )
            .send({
              returnType:
                "TO_VENDOR",

              partId:
                fixtureA.partId,

              quantity:
                1,

              vendorId:
                fixtureA.vendorId,

              purchaseOrderId:
                fixtureB.purchaseOrderId,
            });

        assert.equal(
          foreignPurchaseOrderResponse.status,
          400,
        );

        assert.equal(
          foreignPurchaseOrderResponse.body.code,
          "PART_RETURN_PURCHASE_ORDER_INVALID",
        );

        //************************************************************** */
        // FOREIGN REPAIR ORDER INJECTION — CREATE

        const foreignRepairOrderResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/part-returns`,
            )
            .send({
              returnType:
                "TO_VENDOR",

              partId:
                fixtureA.partId,

              quantity:
                1,

              vendorId:
                fixtureA.vendorId,

              repairOrderId:
                fixtureB.repairOrderId,
            });

        assert.equal(
          foreignRepairOrderResponse.status,
          400,
        );

        assert.equal(
          foreignRepairOrderResponse.body.code,
          "PART_RETURN_REPAIR_ORDER_INVALID",
        );

        //************************************************************** */
        // FOREIGN VENDOR INJECTION — UPDATE LOCAL RETURN

        const foreignVendorUpdateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationAId}/part-returns/${partReturnAId}`,
            )
            .send({
              vendorId:
                fixtureB.vendorId,
            });

        assert.equal(
          foreignVendorUpdateResponse.status,
          400,
        );

        assert.equal(
          foreignVendorUpdateResponse.body.code,
          "PART_RETURN_VENDOR_INVALID",
        );

        //************************************************************** */
        // FOREIGN PURCHASE ORDER INJECTION — UPDATE LOCAL RETURN

        const foreignPurchaseOrderUpdateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationAId}/part-returns/${partReturnAId}`,
            )
            .send({
              purchaseOrderId:
                fixtureB.purchaseOrderId,
            });

        assert.equal(
          foreignPurchaseOrderUpdateResponse.status,
          400,
        );

        assert.equal(
          foreignPurchaseOrderUpdateResponse.body.code,
          "PART_RETURN_PURCHASE_ORDER_INVALID",
        );

        //************************************************************** */
        // FOREIGN REPAIR ORDER INJECTION — UPDATE LOCAL RETURN

        const foreignRepairOrderUpdateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationAId}/part-returns/${partReturnAId}`,
            )
            .send({
              repairOrderId:
                fixtureB.repairOrderId,
            });

        assert.equal(
          foreignRepairOrderUpdateResponse.status,
          400,
        );

        assert.equal(
          foreignRepairOrderUpdateResponse.body.code,
          "PART_RETURN_REPAIR_ORDER_INVALID",
        );

        //************************************************************** */
        // DATABASE INVARIANTS — RETURN B

        const storedReturnB =
          await prisma.partReturn.findUniqueOrThrow({
            where: {
              id:
                partReturnBId,
            },
          });

        assert.equal(
          storedReturnB.organizationId,
          organizationBId,
        );

        assert.equal(
          storedReturnB.partId,
          fixtureB.partId,
        );

        assert.equal(
          storedReturnB.vendorId,
          fixtureB.vendorId,
        );

        assert.equal(
          storedReturnB.purchaseOrderId,
          fixtureB.purchaseOrderId,
        );

        assert.equal(
          storedReturnB.repairOrderId,
          fixtureB.repairOrderId,
        );

        assert.equal(
          storedReturnB.status,
          "PENDING",
        );

        assert.equal(
          storedReturnB.creditStatus,
          "PENDING",
        );

        assert.equal(
          Number(
            storedReturnB.quantity,
          ),
          1,
        );

        assert.equal(
          storedReturnB.notes,
          "Organization B protected part return.",
        );

        assert.equal(
          storedReturnB.isActive,
          true,
        );

        //************************************************************** */
        // DATABASE INVARIANTS — RETURN A

        const storedReturnA =
          await prisma.partReturn.findUniqueOrThrow({
            where: {
              id:
                partReturnAId,
            },
          });

        assert.equal(
          storedReturnA.organizationId,
          organizationAId,
        );

        assert.equal(
          storedReturnA.partId,
          fixtureA.partId,
        );

        assert.equal(
          storedReturnA.vendorId,
          fixtureA.vendorId,
        );

        assert.equal(
          storedReturnA.purchaseOrderId,
          fixtureA.purchaseOrderId,
        );

        assert.equal(
          storedReturnA.repairOrderId,
          fixtureA.repairOrderId,
        );

        assert.equal(
          storedReturnA.status,
          "PENDING",
        );

        //************************************************************** */
        // No Organization A return may reference Part B.

        const crossTenantPart =
          await prisma.partReturn.findFirst({
            where: {
              organizationId:
                organizationAId,

              partId:
                fixtureB.partId,
            },
          });

        assert.equal(
          crossTenantPart,
          null,
        );

        //************************************************************** */
        // No Organization A return may reference Vendor B.

        const crossTenantVendor =
          await prisma.partReturn.findFirst({
            where: {
              organizationId:
                organizationAId,

              vendorId:
                fixtureB.vendorId,
            },
          });

        assert.equal(
          crossTenantVendor,
          null,
        );

        //************************************************************** */
        // No Organization A return may reference PO B.

        const crossTenantPurchaseOrder =
          await prisma.partReturn.findFirst({
            where: {
              organizationId:
                organizationAId,

              purchaseOrderId:
                fixtureB.purchaseOrderId,
            },
          });

        assert.equal(
          crossTenantPurchaseOrder,
          null,
        );

        //************************************************************** */
        // No Organization A return may reference RO B.

        const crossTenantRepairOrder =
          await prisma.partReturn.findFirst({
            where: {
              organizationId:
                organizationAId,

              repairOrderId:
                fixtureB.repairOrderId,
            },
          });

        assert.equal(
          crossTenantRepairOrder,
          null,
        );
      },
    );
  },
);