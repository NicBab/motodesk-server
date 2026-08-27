import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Vendor integration", () => {
  it("creates, retrieves, searches, updates, archives, restores, and rejects invalid lifecycle actions", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    const vendorName = `MotoDesk Vendor ${uniqueSuffix}`;

    //************************************************************** */
    // Create

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vendors`)
      .send({
        name: vendorName,

        accountNumber: `ACC-${uniqueSuffix}`,

        email: `vendor-${uniqueSuffix}@example.com`,

        phone: "3375550100",

        website: "https://example.com",

        addressLine1: "100 Vendor Drive",

        city: "Lafayette",

        state: "LA",

        postalCode: "70501",

        country: "US",

        contactName: "Parts Manager",

        contactEmail: `parts-${uniqueSuffix}@example.com`,

        contactPhone: "3375550200",

        notes: "Vendor integration test.",
      });

    assert.equal(createResponse.status, 201);

    assert.equal(createResponse.body.success, true);

    const vendorId = createResponse.body.data.id;

    assert.equal(typeof vendorId, "string");

    assert.equal(createResponse.body.data.name, vendorName);

    assert.equal(createResponse.body.data.isActive, true);

    //************************************************************** */
    // Get

    const getResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/vendors/${vendorId}`,
    );

    assert.equal(getResponse.status, 200);

    assert.equal(getResponse.body.data.id, vendorId);

    //************************************************************** */
    // Search active

    const searchResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/vendors`)
      .query({
        search: vendorName,

        isActive: "true",
      });

    assert.equal(searchResponse.status, 200);

    assert.equal(
      searchResponse.body.data.some(
        (vendor: { id: string }) => vendor.id === vendorId,
      ),
      true,
    );

    //************************************************************** */
    // Update

    const updateResponse = await agent
      .patch(`/api/v1/organizations/${organizationId}/vendors/${vendorId}`)
      .send({
        phone: "3375559999",

        contactName: "Updated Parts Manager",

        notes: "Updated vendor integration test.",
      });

    assert.equal(updateResponse.status, 200);

    assert.equal(updateResponse.body.data.phone, "3375559999");

    assert.equal(updateResponse.body.data.contactName, "Updated Parts Manager");

    //************************************************************** */
    // Reject duplicate

    const duplicateResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vendors`)
      .send({
        name: vendorName,
      });

    assert.equal(duplicateResponse.status, 409);

    assert.equal(duplicateResponse.body.code, "VENDOR_NAME_TAKEN");

    //************************************************************** */
    // Archive

    const archiveResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/vendors/${vendorId}/archive`,
    );

    assert.equal(archiveResponse.status, 200);

    assert.equal(archiveResponse.body.data.isActive, false);

    //************************************************************** */
    // No longer in active list

    const activeAfterArchiveResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/vendors`)
      .query({
        isActive: "true",
      });

    assert.equal(activeAfterArchiveResponse.status, 200);

    assert.equal(
      activeAfterArchiveResponse.body.data.some(
        (vendor: { id: string }) => vendor.id === vendorId,
      ),
      false,
    );

    //************************************************************** */
    // Appears in archived list

    const archivedResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/vendors`)
      .query({
        isActive: "false",
      });

    assert.equal(archivedResponse.status, 200);

    assert.equal(
      archivedResponse.body.data.some(
        (vendor: { id: string }) => vendor.id === vendorId,
      ),
      true,
    );

    //************************************************************** */
    // Reject second archive

    const secondArchiveResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/vendors/${vendorId}/archive`,
    );

    assert.equal(secondArchiveResponse.status, 400);

    assert.equal(secondArchiveResponse.body.code, "VENDOR_ALREADY_ARCHIVED");

    //************************************************************** */
    // Restore

    const restoreResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/vendors/${vendorId}/restore`,
    );

    assert.equal(restoreResponse.status, 200);

    assert.equal(restoreResponse.body.data.isActive, true);

    //************************************************************** */
    // Back in active list

    const activeAfterRestoreResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/vendors`)
      .query({
        isActive: "true",
      });

    assert.equal(activeAfterRestoreResponse.status, 200);

    assert.equal(
      activeAfterRestoreResponse.body.data.some(
        (vendor: { id: string }) => vendor.id === vendorId,
      ),
      true,
    );

    //************************************************************** */
    // No longer archived

    const archivedAfterRestoreResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/vendors`)
      .query({
        isActive: "false",
      });

    assert.equal(archivedAfterRestoreResponse.status, 200);

    assert.equal(
      archivedAfterRestoreResponse.body.data.some(
        (vendor: { id: string }) => vendor.id === vendorId,
      ),
      false,
    );

    //************************************************************** */
    // Reject second restore

    const secondRestoreResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/vendors/${vendorId}/restore`,
    );

    assert.equal(secondRestoreResponse.status, 400);

    assert.equal(secondRestoreResponse.body.code, "VENDOR_ALREADY_ACTIVE");
  });
});
