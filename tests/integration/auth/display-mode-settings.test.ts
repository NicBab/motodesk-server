import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Display mode settings integration", () => {
  it("updates and persists the authenticated user's display mode", async () => {
    const { agent } = await createAuthenticatedAgent();

    const beforeResponse = await agent.get(
      "/api/v1/auth/me",
    );

    assert.equal(beforeResponse.status, 200);
    assert.equal(beforeResponse.body?.success, true);

    const originalDisplayMode =
      beforeResponse.body.data.user.displayMode;

    //************************************************************** */

    try {
      const updateResponse = await agent
        .patch("/api/v1/auth/profile")
        .send({
          displayMode: "DARK",
        });

      assert.equal(updateResponse.status, 200);
      assert.equal(updateResponse.body?.success, true);

      assert.equal(
        updateResponse.body.data.user.displayMode,
        "DARK",
      );

      //************************************************************** */
      // Read through /auth/me to verify persistence.

      const meResponse = await agent.get(
        "/api/v1/auth/me",
      );

      assert.equal(meResponse.status, 200);
      assert.equal(meResponse.body?.success, true);

      assert.equal(
        meResponse.body.data.user.displayMode,
        "DARK",
      );
    } finally {
      await agent
        .patch("/api/v1/auth/profile")
        .send({
          displayMode:
            originalDisplayMode ?? "SYSTEM",
        });
    }
  });

  //************************************************************** */

  it("accepts every supported display mode", async () => {
    const { agent } = await createAuthenticatedAgent();

    const beforeResponse = await agent.get(
      "/api/v1/auth/me",
    );

    assert.equal(beforeResponse.status, 200);

    const originalDisplayMode =
      beforeResponse.body.data.user.displayMode;

    const supportedModes = [
      "LIGHT",
      "DARK",
      "SYSTEM",
    ] as const;

    //************************************************************** */

    try {
      for (const displayMode of supportedModes) {
        const response = await agent
          .patch("/api/v1/auth/profile")
          .send({
            displayMode,
          });

        assert.equal(response.status, 200);

        assert.equal(
          response.body.data.user.displayMode,
          displayMode,
        );
      }
    } finally {
      await agent
        .patch("/api/v1/auth/profile")
        .send({
          displayMode:
            originalDisplayMode ?? "SYSTEM",
        });
    }
  });

  //************************************************************** */

  it("rejects an unsupported display mode", async () => {
    const { agent } = await createAuthenticatedAgent();

    const response = await agent
      .patch("/api/v1/auth/profile")
      .send({
        displayMode: "NEON",
      });

    assert.equal(response.status, 400);
  });
});

//************************************************************** */