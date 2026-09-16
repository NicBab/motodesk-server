import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

const ACCESS_TOKEN_TTL_MINUTES = 60;

const EXPIRATION_TOLERANCE_SECONDS = 10;

//************************************************************** */

describe("Authentication session expiration integration", () => {
  it("returns the current access-token expiration from /auth/me", async () => {
    const { agent } = await createAuthenticatedAgent();

    //************************************************************** */
    // Capture the time immediately before /me so we can verify
    // that the returned expiration belongs to the access token
    // already issued to this authenticated agent.

    const beforeMe = Date.now();

    const meResponse = await agent.get("/api/v1/auth/me");

    const afterMe = Date.now();

    //************************************************************** */

    assert.equal(meResponse.status, 200);

    assert.equal(meResponse.body?.success, true);

    const accessTokenExpiresAt = meResponse.body?.data?.accessTokenExpiresAt;

    assert.equal(typeof accessTokenExpiresAt, "string");

    //************************************************************** */

    const expirationTime = new Date(accessTokenExpiresAt).getTime();

    assert.equal(Number.isNaN(expirationTime), false);

    //************************************************************** */

    const expectedLifetimeMs = ACCESS_TOKEN_TTL_MINUTES * 60 * 1_000;

    const toleranceMs = EXPIRATION_TOLERANCE_SECONDS * 1_000;

    assert.ok(expirationTime >= beforeMe + expectedLifetimeMs - toleranceMs);

    assert.ok(expirationTime <= afterMe + expectedLifetimeMs + toleranceMs);

    //************************************************************** */
    // /me must report the expiration of the current token rather
    // than manufacture a new expiration on every request.

    const secondMeResponse = await agent.get("/api/v1/auth/me");

    assert.equal(secondMeResponse.status, 200);

    assert.equal(secondMeResponse.body?.success, true);

    assert.equal(
      secondMeResponse.body.data.accessTokenExpiresAt,
      accessTokenExpiresAt,
    );
  });

  //************************************************************** */

  it("refreshes the authenticated session using the HTTP-only refresh cookie", async () => {
    const { agent } = await createAuthenticatedAgent();

    //************************************************************** */
    // Capture the expiration of the access token currently held
    // by the authenticated agent.

    const beforeResponse = await agent.get("/api/v1/auth/me");

    assert.equal(beforeResponse.status, 200);

    assert.equal(beforeResponse.body?.success, true);

    const previousExpiration = beforeResponse.body.data.accessTokenExpiresAt;

    assert.equal(typeof previousExpiration, "string");

    //************************************************************** */
    // No request body is supplied here. The refresh endpoint must
    // use the HTTP-only motodesk_refresh_token cookie maintained
    // by the Supertest agent.

    const beforeRefresh = Date.now();

    const refreshResponse = await agent.post("/api/v1/auth/refresh");

    const afterRefresh = Date.now();

    //************************************************************** */

    assert.equal(refreshResponse.status, 200);

    assert.equal(refreshResponse.body?.success, true);

    const refreshedExpiration =
      refreshResponse.body?.data?.accessTokenExpiresAt;

    assert.ok(
      typeof refreshedExpiration === "string" ||
        refreshedExpiration instanceof Date,
    );

    const refreshedExpirationTime = new Date(refreshedExpiration).getTime();

    assert.equal(Number.isNaN(refreshedExpirationTime), false);

    //************************************************************** */
    // The newly issued access token must receive approximately a
    // fresh 60-minute lifetime.

    const expectedLifetimeMs = ACCESS_TOKEN_TTL_MINUTES * 60 * 1_000;

    const toleranceMs = EXPIRATION_TOLERANCE_SECONDS * 1_000;

    assert.ok(
      refreshedExpirationTime >=
        beforeRefresh + expectedLifetimeMs - toleranceMs,
    );

    assert.ok(
      refreshedExpirationTime <=
        afterRefresh + expectedLifetimeMs + toleranceMs,
    );

    //************************************************************** */
    // The refresh must actually advance the access-token deadline.

    assert.ok(refreshedExpirationTime > new Date(previousExpiration).getTime());

    //************************************************************** */
    // /me must now see the newly issued access cookie and report
    // the same expiration returned by the refresh endpoint.

    const afterResponse = await agent.get("/api/v1/auth/me");

    assert.equal(afterResponse.status, 200);

    assert.equal(afterResponse.body?.success, true);

    assert.equal(
      Math.floor(
        new Date(afterResponse.body.data.accessTokenExpiresAt).getTime() /
          1_000,
      ),
      Math.floor(refreshedExpirationTime / 1_000),
    );
  });
});
