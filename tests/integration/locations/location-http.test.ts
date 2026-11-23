
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  beforeEach,
  describe,
  it,
} from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";
import { prisma } from "../../../src/config/prisma.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

describe("Shop location HTTP authorization", () => {
  let owner: Awaited<
    ReturnType<typeof createAuthenticatedAgent>
  >;

  let defaultLocationId: string;

  function endpoint(path = ""): string {
    return (
      `/api/v1/organizations/${owner.organizationId}` +
      `/locations${path}`
    );
  }

  //************************************************************** */

  async function setPlan(
    planId: "starter" | "business" | "pro",
  ): Promise<void> {
    const unitAmount = {
      starter: 8_900,
      business: 18_900,
      pro: 29_900,
    }[planId];

    await prisma.organizationBilling.update({
      where: {
        organizationId: owner.organizationId,
      },
      data: {
        planId,
        unitAmount,
        additionalLocationQuantity: 0,
        additionalLocationUnitAmount: null,
        stripeAdditionalLocationPriceId: null,
        stripeAdditionalLocationItemId: null,
      },
    });
  }

  //************************************************************** */

  async function createLocation(
    name: string,
    code: string,
  ) {
    return owner.agent.post(endpoint()).send({
      name,
      code,
    });
  }

  //************************************************************** */

  beforeEach(async () => {
    owner = await createAuthenticatedAgent();

    const location = await prisma.shopLocation.create({
      data: {
        organizationId: owner.organizationId,
        name: "Main Shop",
        code: "MAIN",
        isDefault: true,
        status: "ACTIVE",
      },
    });

    defaultLocationId = location.id;
  });

  //************************************************************** */

  it("rejects unauthenticated location requests", async () => {
    const response = await request(app).get(endpoint());

    assert.equal(response.status, 401);
    assert.equal(
      response.body.code,
      "AUTHENTICATION_REQUIRED",
    );
  });

  //************************************************************** */

  it("allows the owner to list organization locations", async () => {
    const response = await owner.agent.get(endpoint());

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.data));

    assert.ok(
      response.body.data.some(
        (location: { id: string }) =>
          location.id === defaultLocationId,
      ),
    );
  });

  //************************************************************** */

  it("allows the owner to retrieve location details", async () => {
    const response = await owner.agent.get(
      endpoint(`/${defaultLocationId}`),
    );

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    assert.equal(
      response.body.data.id,
      defaultLocationId,
    );
  });

  //************************************************************** */

  it("rejects access to another organization's location", async () => {
    const other = await createAuthenticatedAgent();

    const outsideLocation =
      await prisma.shopLocation.create({
        data: {
          organizationId: other.organizationId,
          name: "Outside Shop",
          code: "OUTSIDE",
          isDefault: true,
          status: "ACTIVE",
        },
      });

    const response = await owner.agent.get(
      endpoint(`/${outsideLocation.id}`),
    );

    assert.equal(
      response.status,
      404,
      JSON.stringify(response.body),
    );

    assert.equal(
      response.body.code,
      "SHOP_LOCATION_NOT_FOUND",
    );
  });

  //************************************************************** */

  it("rejects requests targeting another organization", async () => {
    const other = await createAuthenticatedAgent();

    const response = await owner.agent.get(
      `/api/v1/organizations/${other.organizationId}/locations`,
    );

    assert.ok(
      response.status === 401 ||
      response.status === 403,
      JSON.stringify(response.body),
    );
  });

  //************************************************************** */

  it("allows the second included Pro location", async () => {
    const response = await createLocation(
      "Second Shop",
      "SECOND",
    );

    assert.equal(
      response.status,
      201,
      JSON.stringify(response.body),
    );

    assert.equal(response.body.success, true);
    assert.equal(
      response.body.data.organizationId,
      owner.organizationId,
    );

    assert.equal(response.body.data.status, "ACTIVE");
  });

  //************************************************************** */

  it("rejects a third unpaid Pro location", async () => {
    await createLocation("Second Shop", "SECOND").then(
      (response) => {
        assert.equal(
          response.status,
          201,
          JSON.stringify(response.body),
        );
      },
    );

    const response = await createLocation(
      "Third Shop",
      "THIRD",
    );

    assert.equal(
      response.status,
      409,
      JSON.stringify(response.body),
    );

    assert.equal(
      response.body.code,
      "BILLING_LOCATION_CAPACITY_EXCEEDED",
    );
  });

  //************************************************************** */

  it("rejects a second Starter location", async () => {
    await setPlan("starter");

    const response = await createLocation(
      "Second Shop",
      "SECOND",
    );

    assert.equal(
      response.status,
      409,
      JSON.stringify(response.body),
    );

    assert.equal(
      response.body.code,
      "BILLING_LOCATION_CAPACITY_EXCEEDED",
    );
  });

  //************************************************************** */

  it("rejects invalid location creation input", async () => {
    const response = await owner.agent
      .post(endpoint())
      .send({
        name: "",
        code: "INVALID CODE!",
      });

    assert.equal(
      response.status,
      400,
      JSON.stringify(response.body),
    );

    const count = await prisma.shopLocation.count({
      where: {
        organizationId: owner.organizationId,
      },
    });

    assert.equal(count, 1);
  });

  //************************************************************** */

  it("rejects duplicate location codes", async () => {
    const response = await createLocation(
      "Another Main Shop",
      "MAIN",
    );

    assert.equal(
      response.status,
      409,
      JSON.stringify(response.body),
    );

    assert.equal(
      response.body.code,
      "SHOP_LOCATION_ALREADY_EXISTS",
    );
  });

  //************************************************************** */

  it("allows the owner to view available employees", async () => {
    const response = await owner.agent.get(
      endpoint("/employees"),
    );

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    assert.ok(Array.isArray(response.body.data));
  });

  //************************************************************** */

  it("allows an owner to assign an active employee", async () => {
    const response = await owner.agent
      .put(endpoint(`/${defaultLocationId}/employees`))
      .send({
        locationId: defaultLocationId,
        membershipIds: [owner.membershipId],
      });

    assert.equal(
      response.status,
      200,
      JSON.stringify(response.body),
    );

    assert.equal(response.body.data.length, 1);
    assert.equal(
      response.body.data[0].membershipId,
      owner.membershipId,
    );
  });

  //************************************************************** */

  it("rejects mismatched location IDs in assignment requests", async () => {
    const response = await owner.agent
      .put(endpoint(`/${defaultLocationId}/employees`))
      .send({
        locationId: randomUUID(),
        membershipIds: [],
      });

    assert.equal(
      response.status,
      400,
      JSON.stringify(response.body),
    );

    assert.equal(
      response.body.code,
      "LOCATION_ID_MISMATCH",
    );
  });

  //************************************************************** */

  it("rejects assignments from another organization", async () => {
    const other = await createAuthenticatedAgent();

    const response = await owner.agent
      .put(endpoint(`/${defaultLocationId}/employees`))
      .send({
        locationId: defaultLocationId,
        membershipIds: [other.membershipId],
      });

    assert.equal(
      response.status,
      400,
      JSON.stringify(response.body),
    );

    assert.equal(
      response.body.code,
      "INVALID_LOCATION_EMPLOYEE",
    );
  });

  //************************************************************** */

  it("requires recent authentication for location creation", async () => {
const membership = await prisma.membership.findUniqueOrThrow({
  where: {
    id: owner.membershipId,
  },
  select: {
    userId: true,
  },
});

const session = await prisma.session.findFirstOrThrow({
  where: {
    userId: membership.userId,
    audience: "CLIENT",
    activeOrganizationId: owner.organizationId,
    revokedAt: null,
  },
  orderBy: {
    createdAt: "desc",
  },
});

    await prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        lastAuthenticatedAt: new Date(
          "2000-01-01T00:00:00.000Z",
        ),
      },
    });

    const response = await createLocation(
      "Stale Session Shop",
      "STALE",
    );

    assert.equal(
      response.status,
      403,
      JSON.stringify(response.body),
    );

    assert.equal(
      response.body.code,
      "RECENT_AUTHENTICATION_REQUIRED",
    );
  });

  //************************************************************** */
});
