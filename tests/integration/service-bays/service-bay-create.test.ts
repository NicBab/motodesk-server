import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Service bay creation integration", () => {
  it("creates and lists service bays and rejects duplicate names", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const name = `Service Bay ${suffix}`;

    //************************************************************** */
    // Create

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/service-bays`)
      .send({
        name,
        description: "Primary repair bay.",
      });

    assert.equal(createResponse.status, 200);

    assert.equal(createResponse.body.data.organizationId, organizationId);

    assert.equal(createResponse.body.data.name, name);

    assert.equal(createResponse.body.data.status, "ACTIVE");

    //************************************************************** */
    // List

    const listResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/service-bays`,
    );

    assert.equal(listResponse.status, 200);

    assert.equal(Array.isArray(listResponse.body.data), true);

    const createdBay = listResponse.body.data.find(
      (serviceBay: { id: string }) =>
        serviceBay.id === createResponse.body.data.id,
    );

    assert.notEqual(createdBay, undefined);

    //************************************************************** */
    // Duplicate Name

    const duplicateResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/service-bays`)
      .send({
        name,
      });

    assert.equal(duplicateResponse.status, 400);

    assert.equal(
      duplicateResponse.body.code,
      "SERVICE_BAY_NAME_ALREADY_EXISTS",
    );
  });
});
