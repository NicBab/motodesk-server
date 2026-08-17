import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

describe(
  "Vehicle integration",
  () => {
    it(
      "creates, retrieves, updates, searches, and archives a vehicle",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        //************************************************************** */
        // Create a customer for the vehicle

        const customerResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type: "INDIVIDUAL",
              firstName:
                "Vehicle",
              lastName:
                "Owner",
              email:
                "vehicle.owner@motodesk.local",
            });

        assert.equal(
          customerResponse.status,
          201,
        );

        const customerId =
          customerResponse.body.data.id;

        //************************************************************** */
        // Create vehicle

        const createResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/vehicles`,
            )
            .send({
              customerId,
              year: 2024,
              make: "Yamaha",
              model: "YZ450F",
              trim: "Team Yamaha Blue",
              vin:
                `VIN-${Date.now()}`,
              mileage: 12,
              color: "Blue",
              type: "MOTORCYCLE",
              classification:
                "SERVICE",
              inventoryStatus:
                "AVAILABLE",
              notes:
                "Vehicle integration test.",
            });

        assert.equal(
          createResponse.status,
          201,
        );

        assert.equal(
          createResponse.body.success,
          true,
        );

        const vehicleId =
          createResponse.body.data.id;

        assert.equal(
          typeof vehicleId,
          "string",
        );

        assert.equal(
          createResponse.body.data.customerId,
          customerId,
        );

        //************************************************************** */
        // Get vehicle

        const getResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/vehicles/${vehicleId}`,
          );

        assert.equal(
          getResponse.status,
          200,
        );

        assert.equal(
          getResponse.body.data.id,
          vehicleId,
        );

        //************************************************************** */
        // Update vehicle

        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/vehicles/${vehicleId}`,
            )
            .send({
              mileage: 25,
              notes:
                "Updated vehicle integration test.",
            });

        assert.equal(
          updateResponse.status,
          200,
        );

        assert.equal(
          updateResponse.body.data.mileage,
          25,
        );

        //************************************************************** */
        // Search vehicle

        const listResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/vehicles`,
            )
            .query({
              search: "YZ450F",
              type: "MOTORCYCLE",
              isActive: "true",
            });

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.success,
          true,
        );

        const vehicleFound =
          listResponse.body.data.some(
            (
              vehicle: {
                id: string;
              },
            ) =>
              vehicle.id ===
              vehicleId,
          );

        assert.equal(
          vehicleFound,
          true,
        );

        //************************************************************** */
        // Archive vehicle

        const archiveResponse =
          await agent.post(
            `/api/v1/organizations/${organizationId}/vehicles/${vehicleId}/archive`,
          );

        assert.equal(
          archiveResponse.status,
          200,
        );

        assert.equal(
          archiveResponse.body.data.isActive,
          false,
        );

        //************************************************************** */
        // Reject second archive

        const secondArchiveResponse =
          await agent.post(
            `/api/v1/organizations/${organizationId}/vehicles/${vehicleId}/archive`,
          );

        assert.equal(
          secondArchiveResponse.status,
          400,
        );

        assert.equal(
          secondArchiveResponse.body.code,
          "VEHICLE_ALREADY_ARCHIVED",
        );
      },
    );
  },
);