import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Company financial settings integration", () => {
  it(
    "snapshots company tax and shop supplies rates onto new repair orders without changing existing repair orders",
    async () => {
      const {
        agent,
        organizationId,
      } = await createAuthenticatedAgent();

      //************************************************************** */
      // Set Initial Company Financial Settings

      const initialTaxRate = 8.45;

      const initialShopSuppliesRate = 6.5;

      const initialSettingsResponse = await agent
        .patch(
          `/api/v1/organizations/${organizationId}`,
        )
        .send({
          taxRate: initialTaxRate,

          shopSuppliesRate: initialShopSuppliesRate,
        });

      assert.equal(
        initialSettingsResponse.status,
        200,
      );

      assert.equal(
        Number(initialSettingsResponse.body.data.taxRate),
        initialTaxRate,
      );

      assert.equal(
        Number(
          initialSettingsResponse.body.data.shopSuppliesRate,
        ),
        initialShopSuppliesRate,
      );

      //************************************************************** */
      // Create Test Customer

      const suffix =
        `${Date.now()}-${Math.random()}`;

      const customer =
        await prisma.customer.create({
          data: {
            organizationId,

            firstName: "Company",

            lastName: "Settings Test",

            email:
              `company-settings-${suffix}@motodesk.test`,
          },
        });

      //************************************************************** */
      // Create Test Vehicle

      const vehicle =
        await prisma.vehicle.create({
          data: {
            organizationId,

            customerId: customer.id,

            year: 2026,

            make: "MotoDesk",

            model: "Settings Test Vehicle",

            vin:
              `SETTINGS-${Date.now()}`,

            type: "MOTORCYCLE",

            classification: "SERVICE",
          },
        });

      //************************************************************** */
      // Create Repair Order A
      //
      // No financial rates are supplied. The server must snapshot
      // the current organization defaults.

      const repairOrderAResponse = await agent
        .post(
          `/api/v1/organizations/${organizationId}/repair-orders`,
        )
        .send({
          customerId: customer.id,

          vehicleId: vehicle.id,
        });

      assert.equal(
        repairOrderAResponse.status,
        201,
      );

      const repairOrderAId =
        repairOrderAResponse.body.data.id;

      assert.ok(repairOrderAId);

      assert.equal(
        Number(
          repairOrderAResponse.body.data.taxRate,
        ),
        initialTaxRate,
      );

      assert.equal(
        Number(
          repairOrderAResponse.body.data.shopSuppliesRate,
        ),
        initialShopSuppliesRate,
      );

      //************************************************************** */
      // Change Company Financial Settings

      const updatedTaxRate = 9.25;

      const updatedShopSuppliesRate = 7.75;

      const updatedSettingsResponse = await agent
        .patch(
          `/api/v1/organizations/${organizationId}`,
        )
        .send({
          taxRate: updatedTaxRate,

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
      // Repair Order A Must Retain Original Snapshot

      const repairOrderAAfterSettingsChange =
        await agent.get(
          `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderAId}`,
        );

      assert.equal(
        repairOrderAAfterSettingsChange.status,
        200,
      );

      assert.equal(
        Number(
          repairOrderAAfterSettingsChange.body.data.taxRate,
        ),
        initialTaxRate,
      );

      assert.equal(
        Number(
          repairOrderAAfterSettingsChange.body.data.shopSuppliesRate,
        ),
        initialShopSuppliesRate,
      );

      //************************************************************** */
      // Create Repair Order B
      //
      // The second RO must snapshot the new company settings.

      const repairOrderBResponse = await agent
        .post(
          `/api/v1/organizations/${organizationId}/repair-orders`,
        )
        .send({
          customerId: customer.id,

          vehicleId: vehicle.id,
        });

      assert.equal(
        repairOrderBResponse.status,
        201,
      );

      const repairOrderBId =
        repairOrderBResponse.body.data.id;

      assert.ok(repairOrderBId);

      assert.equal(
        Number(
          repairOrderBResponse.body.data.taxRate,
        ),
        updatedTaxRate,
      );

      assert.equal(
        Number(
          repairOrderBResponse.body.data.shopSuppliesRate,
        ),
        updatedShopSuppliesRate,
      );

      //************************************************************** */
      // Verify Persisted Snapshots

      const storedRepairOrderA =
        await prisma.repairOrder.findUnique({
          where: {
            id: repairOrderAId,
          },
        });

      const storedRepairOrderB =
        await prisma.repairOrder.findUnique({
          where: {
            id: repairOrderBId,
          },
        });

      assert.ok(storedRepairOrderA);

      assert.ok(storedRepairOrderB);

      assert.equal(
        Number(storedRepairOrderA.taxRate),
        initialTaxRate,
      );

      assert.equal(
        Number(
          storedRepairOrderA.shopSuppliesRate,
        ),
        initialShopSuppliesRate,
      );

      assert.equal(
        Number(storedRepairOrderB.taxRate),
        updatedTaxRate,
      );

      assert.equal(
        Number(
          storedRepairOrderB.shopSuppliesRate,
        ),
        updatedShopSuppliesRate,
      );
    },
  );
});

//************************************************************** */