import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Appearance settings integration", () => {
  it("updates and persists the organization application theme", async () => {
    const {
      agent,
      organizationId,
    } = await createAuthenticatedAgent();

    //************************************************************** */
    // Capture the current organization theme so the seeded
    // development organization can be restored after the test.

    const beforeResponse = await agent.get(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(
      beforeResponse.status,
      200,
    );

    assert.equal(
      beforeResponse.body?.success,
      true,
    );

    const originalTheme =
      beforeResponse.body.data.applicationTheme;

    //************************************************************** */

    try {
      const updateResponse = await agent
        .patch(
          `/api/v1/organizations/${organizationId}`,
        )
        .send({
          applicationTheme: "marine",
        });

      assert.equal(
        updateResponse.status,
        200,
      );

      assert.equal(
        updateResponse.body?.success,
        true,
      );

      assert.equal(
        updateResponse.body.data.applicationTheme,
        "marine",
      );

      //************************************************************** */
      // Read the organization again to prove the theme was
      // persisted rather than only returned by the update handler.

      const organizationResponse =
        await agent.get(
          `/api/v1/organizations/${organizationId}`,
        );

      assert.equal(
        organizationResponse.status,
        200,
      );

      assert.equal(
        organizationResponse.body?.success,
        true,
      );

      assert.equal(
        organizationResponse.body.data.applicationTheme,
        "marine",
      );

      //************************************************************** */
      // /organizations/me is the organization-selection payload
      // consumed by authenticated clients. It must expose the theme.

      const membershipsResponse =
        await agent.get(
          "/api/v1/organizations/me",
        );

      assert.equal(
        membershipsResponse.status,
        200,
      );

      assert.equal(
        membershipsResponse.body?.success,
        true,
      );

      const membership =
        membershipsResponse.body.data.find(
          (item: {
            organization?: {
              id?: string;
            };
          }) =>
            item.organization?.id ===
            organizationId,
        );

      assert.ok(membership);

      assert.equal(
        membership.organization.applicationTheme,
        "marine",
      );
    } finally {
      await agent
        .patch(
          `/api/v1/organizations/${organizationId}`,
        )
        .send({
          applicationTheme:
            originalTheme ?? "default",
        });
    }
  });

  //************************************************************** */

  it("accepts every supported application theme", async () => {
    const {
      agent,
      organizationId,
    } = await createAuthenticatedAgent();

    const beforeResponse = await agent.get(
      `/api/v1/organizations/${organizationId}`,
    );

    assert.equal(
      beforeResponse.status,
      200,
    );

    const originalTheme =
      beforeResponse.body.data.applicationTheme;

    const supportedThemes = [
      "offroad",
      "marine",
      "lawn",
      "sport",
    ] as const;

    //************************************************************** */

    try {
      for (const applicationTheme of supportedThemes) {
        const response = await agent
          .patch(
            `/api/v1/organizations/${organizationId}`,
          )
          .send({
            applicationTheme,
          });

        assert.equal(
          response.status,
          200,
        );

        assert.equal(
          response.body.data.applicationTheme,
          applicationTheme,
        );
      }
    } finally {
      await agent
        .patch(
          `/api/v1/organizations/${organizationId}`,
        )
        .send({
          applicationTheme:
            originalTheme ?? "default",
        });
    }
  });

  //************************************************************** */

  it("rejects an unsupported application theme", async () => {
    const {
      agent,
      organizationId,
    } = await createAuthenticatedAgent();

    const response = await agent
      .patch(
        `/api/v1/organizations/${organizationId}`,
      )
      .send({
        applicationTheme:
          "not-a-real-theme",
      });

    assert.equal(
      response.status,
      400,
    );
  });
});

//************************************************************** */