import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import {
  createAuthenticatedAgent,
} from "./helpers/authenticated-agent.js";

import {
  prisma,
} from "../../src/config/prisma.js";

//************************************************************** */

describe(
  "Parts integration",
  () => {
    it(
      "creates, retrieves, searches, updates, archives, and records initial inventory",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const uniqueSuffix =
          Date.now().toString();

        const partNumber =
          `TEST-${uniqueSuffix}`;

        //************************************************************** */
        // Create

        const createResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber,
              oemPartNumber:
                `OEM-${uniqueSuffix}`,
              alternatePartNumbers: [
                `ALT-${uniqueSuffix}`,
              ],
              description:
                "Integration test oil filter",
              brand:
                "MotoDesk Test Brand",
              category:
                "Filters",
              qtyOnHand:
                5,
              reorderPoint:
                2,
              costPrice:
                8.5,
              sellPrice:
                14.99,
              location:
                "A-01",
            });

        assert.equal(
          createResponse.status,
          201,
        );

        assert.equal(
          createResponse.body.success,
          true,
        );

        const partId =
          createResponse.body.data.id;

        assert.equal(
          typeof partId,
          "string",
        );

        assert.equal(
          createResponse.body.data.partNumber,
          partNumber,
        );

        assert.equal(
          Number(
            createResponse.body.data.qtyOnHand,
          ),
          5,
        );

        //************************************************************** */
        // Verify INITIAL inventory transaction

        const inventoryTransactions =
          await prisma.partInventoryTransaction.findMany({
            where: {
              partId,
            },
            orderBy: {
              createdAt:
                "asc",
            },
          });

        assert.equal(
          inventoryTransactions.length,
          1,
        );

        assert.equal(
          inventoryTransactions[0]?.type,
          "INITIAL",
        );

        assert.equal(
          Number(
            inventoryTransactions[0]?.quantity,
          ),
          5,
        );

        assert.equal(
          Number(
            inventoryTransactions[0]?.quantityBefore,
          ),
          0,
        );

        assert.equal(
          Number(
            inventoryTransactions[0]?.quantityAfter,
          ),
          5,
        );

        //************************************************************** */
        // Get

        const getResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/parts/${partId}`,
          );

        assert.equal(
          getResponse.status,
          200,
        );

        assert.equal(
          getResponse.body.data.id,
          partId,
        );

        //************************************************************** */
        // Search

        const searchResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .query({
              search:
                partNumber,
              isActive:
                "true",
            });

        assert.equal(
          searchResponse.status,
          200,
        );

        assert.equal(
          searchResponse.body.success,
          true,
        );

        const found =
          searchResponse.body.data.some(
            (
              part: {
                id: string;
              },
            ) =>
              part.id ===
              partId,
          );

        assert.equal(
          found,
          true,
        );

        //************************************************************** */
        // Update

        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/parts/${partId}`,
            )
            .send({
              description:
                "Updated integration test oil filter",
              sellPrice:
                16.99,
              location:
                "B-02",
            });

        assert.equal(
          updateResponse.status,
          200,
        );

        assert.equal(
          updateResponse.body.data.description,
          "Updated integration test oil filter",
        );

        assert.equal(
          Number(
            updateResponse.body.data.sellPrice,
          ),
          16.99,
        );

        assert.equal(
          updateResponse.body.data.location,
          "B-02",
        );

        //************************************************************** */
        // Reject duplicate part number

        const duplicateResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber,
              description:
                "Duplicate part",
            });

        assert.equal(
          duplicateResponse.status,
          409,
        );

        assert.equal(
          duplicateResponse.body.code,
          "PART_NUMBER_TAKEN",
        );

        //************************************************************** */
        // Archive

        const archiveResponse =
          await agent.post(
            `/api/v1/organizations/${organizationId}/parts/${partId}/archive`,
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
            `/api/v1/organizations/${organizationId}/parts/${partId}/archive`,
          );

        assert.equal(
          secondArchiveResponse.status,
          400,
        );

        assert.equal(
          secondArchiveResponse.body.code,
          "PART_ALREADY_ARCHIVED",
        );
      },
    );
  },
);