import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Profile settings integration", () => {
  it("updates and persists job title and preferred timezone", async () => {
    const { agent } = await createAuthenticatedAgent();

    //************************************************************** */
    // Capture current profile so the seeded development user can
    // be restored after the test.

    const beforeResponse = await agent.get("/api/v1/auth/me");

    assert.equal(beforeResponse.status, 200);
    assert.equal(beforeResponse.body?.success, true);

    const originalUser = beforeResponse.body.data.user;

    assert.ok(originalUser);

    //************************************************************** */

    try {
      const updateResponse = await agent
        .patch("/api/v1/auth/profile")
        .send({
          jobTitle: "Service Manager",
          preferredTimezone: "America/New_York",
        });

      assert.equal(updateResponse.status, 200);
      assert.equal(updateResponse.body?.success, true);

      const updatedUser = updateResponse.body.data.user;

      assert.equal(
        updatedUser.jobTitle,
        "Service Manager",
      );

      assert.equal(
        updatedUser.preferredTimezone,
        "America/New_York",
      );

      //************************************************************** */
      // Read through /auth/me to prove these are persisted values,
      // not merely values returned from the update handler.

      const meResponse = await agent.get("/api/v1/auth/me");

      assert.equal(meResponse.status, 200);
      assert.equal(meResponse.body?.success, true);

      const persistedUser = meResponse.body.data.user;

      assert.equal(
        persistedUser.jobTitle,
        "Service Manager",
      );

      assert.equal(
        persistedUser.preferredTimezone,
        "America/New_York",
      );
    } finally {
      //************************************************************** */
      // Restore the seeded user's original profile values.

      await agent
        .patch("/api/v1/auth/profile")
        .send({
          jobTitle:
            originalUser.jobTitle ?? null,

          preferredTimezone:
            originalUser.preferredTimezone ??
            "America/Chicago",
        });
    }
  });

  //************************************************************** */

  it("updates the new settings without changing existing profile fields", async () => {
    const { agent } = await createAuthenticatedAgent();

    const beforeResponse = await agent.get("/api/v1/auth/me");

    assert.equal(beforeResponse.status, 200);
    assert.equal(beforeResponse.body?.success, true);

    const originalUser = beforeResponse.body.data.user;

    assert.ok(originalUser);

    //************************************************************** */

    try {
      const updateResponse = await agent
        .patch("/api/v1/auth/profile")
        .send({
          jobTitle: "Shop Foreman",
          preferredTimezone: "America/Denver",
        });

      assert.equal(updateResponse.status, 200);

      const updatedUser = updateResponse.body.data.user;

      assert.equal(updatedUser.id, originalUser.id);
      assert.equal(updatedUser.email, originalUser.email);
      assert.equal(
        updatedUser.firstName,
        originalUser.firstName,
      );
      assert.equal(
        updatedUser.lastName,
        originalUser.lastName,
      );
      assert.equal(updatedUser.phone, originalUser.phone);

      assert.equal(
        updatedUser.jobTitle,
        "Shop Foreman",
      );

      assert.equal(
        updatedUser.preferredTimezone,
        "America/Denver",
      );
    } finally {
      await agent
        .patch("/api/v1/auth/profile")
        .send({
          jobTitle:
            originalUser.jobTitle ?? null,

          preferredTimezone:
            originalUser.preferredTimezone ??
            "America/Chicago",
        });
    }
  });

  //************************************************************** */

  it("rejects an empty profile update", async () => {
    const { agent } = await createAuthenticatedAgent();

    const response = await agent
      .patch("/api/v1/auth/profile")
      .send({});

    assert.equal(response.status, 400);
  });
});

//************************************************************** */