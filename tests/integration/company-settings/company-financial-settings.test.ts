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
  "Company financial settings integration",
  () => {
    it(
      "updates open repair orders, preserves finalized repair orders, and applies current rates to new repair orders",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        //************************************************************** */
        // Initial Company Financial Settings

        const initialTaxRate =
          8.45;

        const initialShopSuppliesRate =
          6.5;

        const initialSettingsResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}`,
            )
            .send({
              taxRate:
                initialTaxRate,

              shopSuppliesRate:
                initialShopSuppliesRate,
            });

        assert.equal(
          initialSettingsResponse.status,
          200,
        );

        assert.equal(
          Number(
            initialSettingsResponse.body.data.taxRate,
          ),
          initialTaxRate,
        );

        assert.equal(
          Number(
            initialSettingsResponse.body.data.shopSuppliesRate,
          ),
          initialShopSuppliesRate,
        );

        //************************************************************** */
        // Test Customer

        const suffix =
          `${Date.now()}-${Math.random()}`;

        const customer =
          await prisma.customer.create({
            data: {
              organizationId,

              firstName:
                "Company",

              lastName:
                "Settings Test",

              email:
                `company-settings-${suffix}@motodesk.test`,
            },
          });

        //************************************************************** */
        // Test Vehicle

        const vehicle =
          await prisma.vehicle.create({
            data: {
              organizationId,

              customerId:
                customer.id,

              year:
                2026,

              make:
                "MotoDesk",

              model:
                "Settings Test Vehicle",

              vin:
                `SETTINGS-${Date.now()}`,

              type:
                "MOTORCYCLE",

              classification:
                "SERVICE",
            },
          });

        //************************************************************** */
        // Create Open Repair Order
        //
        // The RO should initially inherit the organization's current
        // financial settings.

        const openRepairOrderResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders`,
            )
            .send({
              customerId:
                customer.id,

              vehicleId:
                vehicle.id,
            });

        assert.equal(
          openRepairOrderResponse.status,
          201,
        );

        const openRepairOrderId =
          openRepairOrderResponse.body.data.id;

        assert.ok(
          openRepairOrderId,
        );

        assert.equal(
          Number(
            openRepairOrderResponse.body.data.taxRate,
          ),
          initialTaxRate,
        );

        assert.equal(
          Number(
            openRepairOrderResponse.body.data.shopSuppliesRate,
          ),
          initialShopSuppliesRate,
        );

        //************************************************************** */
        // Create Repair Order That Will Become Finalized
        //
        // It starts with the same company defaults.

        const finalizedRepairOrderResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders`,
            )
            .send({
              customerId:
                customer.id,

              vehicleId:
                vehicle.id,
            });

        assert.equal(
          finalizedRepairOrderResponse.status,
          201,
        );

        const finalizedRepairOrderId =
          finalizedRepairOrderResponse.body.data.id;

        assert.ok(
          finalizedRepairOrderId,
        );

        assert.equal(
          Number(
            finalizedRepairOrderResponse.body.data.taxRate,
          ),
          initialTaxRate,
        );

        assert.equal(
          Number(
            finalizedRepairOrderResponse.body.data.shopSuppliesRate,
          ),
          initialShopSuppliesRate,
        );

        //************************************************************** */
        // Finalize Second Repair Order
        //
        // This test is specifically validating financial-setting
        // propagation. Setting the persisted lifecycle state directly
        // isolates that behavior from cashier/payment prerequisites.
        //
        // CASHIERED is a protected/finalized status in the company
        // financial-settings propagation logic.

        await prisma.repairOrder.update({
          where: {
            id:
              finalizedRepairOrderId,
          },

          data: {
            status:
              "CASHIERED",
          },
        });

        //************************************************************** */
        // Verify Both ROs Before Company Settings Change

        const openBeforeChange =
          await prisma.repairOrder.findUnique({
            where: {
              id:
                openRepairOrderId,
            },
          });

        const finalizedBeforeChange =
          await prisma.repairOrder.findUnique({
            where: {
              id:
                finalizedRepairOrderId,
            },
          });

        assert.ok(
          openBeforeChange,
        );

        assert.ok(
          finalizedBeforeChange,
        );

        assert.equal(
          Number(
            openBeforeChange.taxRate,
          ),
          initialTaxRate,
        );

        assert.equal(
          Number(
            openBeforeChange.shopSuppliesRate,
          ),
          initialShopSuppliesRate,
        );

        assert.equal(
          Number(
            finalizedBeforeChange.taxRate,
          ),
          initialTaxRate,
        );

        assert.equal(
          Number(
            finalizedBeforeChange.shopSuppliesRate,
          ),
          initialShopSuppliesRate,
        );

        assert.equal(
          finalizedBeforeChange.status,
          "CASHIERED",
        );

        //************************************************************** */
        // Change Company Financial Settings

        const updatedTaxRate =
          9.25;

        const updatedShopSuppliesRate =
          7.75;

        const updatedSettingsResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}`,
            )
            .send({
              taxRate:
                updatedTaxRate,

              shopSuppliesRate:
                updatedShopSuppliesRate,
            });

        assert.equal(
          updatedSettingsResponse.status,
          200,
        );

        assert.equal(
          Number(
            updatedSettingsResponse.body.data.taxRate,
          ),
          updatedTaxRate,
        );

        assert.equal(
          Number(
            updatedSettingsResponse.body.data.shopSuppliesRate,
          ),
          updatedShopSuppliesRate,
        );

        //************************************************************** */
        // Open RO Must Receive New Company Rates

        const openRepairOrderAfterChange =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${openRepairOrderId}`,
          );

        assert.equal(
          openRepairOrderAfterChange.status,
          200,
        );

        assert.equal(
          Number(
            openRepairOrderAfterChange.body.data.taxRate,
          ),
          updatedTaxRate,
        );

        assert.equal(
          Number(
            openRepairOrderAfterChange.body.data.shopSuppliesRate,
          ),
          updatedShopSuppliesRate,
        );

        //************************************************************** */
        // Finalized RO Must Retain Historical Rates

        const finalizedRepairOrderAfterChange =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${finalizedRepairOrderId}`,
          );

        assert.equal(
          finalizedRepairOrderAfterChange.status,
          200,
        );

        assert.equal(
          finalizedRepairOrderAfterChange.body.data.status,
          "CASHIERED",
        );

        assert.equal(
          Number(
            finalizedRepairOrderAfterChange.body.data.taxRate,
          ),
          initialTaxRate,
        );

        assert.equal(
          Number(
            finalizedRepairOrderAfterChange.body.data.shopSuppliesRate,
          ),
          initialShopSuppliesRate,
        );

        //************************************************************** */
        // Create New RO After Company Settings Change
        //
        // New repair orders must inherit the current company settings.

        const newRepairOrderResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders`,
            )
            .send({
              customerId:
                customer.id,

              vehicleId:
                vehicle.id,
            });

        assert.equal(
          newRepairOrderResponse.status,
          201,
        );

        const newRepairOrderId =
          newRepairOrderResponse.body.data.id;

        assert.ok(
          newRepairOrderId,
        );

        assert.equal(
          Number(
            newRepairOrderResponse.body.data.taxRate,
          ),
          updatedTaxRate,
        );

        assert.equal(
          Number(
            newRepairOrderResponse.body.data.shopSuppliesRate,
          ),
          updatedShopSuppliesRate,
        );

        //************************************************************** */
        // Verify Persisted Database State

        const storedOpenRepairOrder =
          await prisma.repairOrder.findUnique({
            where: {
              id:
                openRepairOrderId,
            },
          });

        const storedFinalizedRepairOrder =
          await prisma.repairOrder.findUnique({
            where: {
              id:
                finalizedRepairOrderId,
            },
          });

        const storedNewRepairOrder =
          await prisma.repairOrder.findUnique({
            where: {
              id:
                newRepairOrderId,
            },
          });

        assert.ok(
          storedOpenRepairOrder,
        );

        assert.ok(
          storedFinalizedRepairOrder,
        );

        assert.ok(
          storedNewRepairOrder,
        );

        //************************************************************** */
        // Open RO = Updated Rates

        assert.equal(
          Number(
            storedOpenRepairOrder.taxRate,
          ),
          updatedTaxRate,
        );

        assert.equal(
          Number(
            storedOpenRepairOrder.shopSuppliesRate,
          ),
          updatedShopSuppliesRate,
        );

        //************************************************************** */
        // Finalized RO = Original Historical Rates

        assert.equal(
          storedFinalizedRepairOrder.status,
          "CASHIERED",
        );

        assert.equal(
          Number(
            storedFinalizedRepairOrder.taxRate,
          ),
          initialTaxRate,
        );

        assert.equal(
          Number(
            storedFinalizedRepairOrder.shopSuppliesRate,
          ),
          initialShopSuppliesRate,
        );

        //************************************************************** */
        // New RO = Current Company Rates

        assert.equal(
          Number(
            storedNewRepairOrder.taxRate,
          ),
          updatedTaxRate,
        );

        assert.equal(
          Number(
            storedNewRepairOrder.shopSuppliesRate,
          ),
          updatedShopSuppliesRate,
        );
      },
    );
  },
);

//************************************************************** */