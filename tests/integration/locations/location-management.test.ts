
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import {
  createShopLocationRecord,
} from "../../../src/modules/locations/location-write.repository.js";

import {
  replaceLocationEmployeeAssignments,
} from "../../../src/modules/locations/location-assignment.repository.js";

import {
  getOrganizationLocation,
  createOrganizationLocation,
  assignOrganizationLocationEmployees,
} from "../../../src/modules/locations/location.service.js";

import type {
  MembershipActorContext,
} from "../../../src/modules/memberships/membership.types.js";

//************************************************************** */

describe("Shop location management integration", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  let organizationId: string;
  let defaultLocationId: string;
  let ownerActor: MembershipActorContext;

  //************************************************************** */

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `location-test-${randomUUID()}@example.com`,
        firstName: "Location",
        lastName: "Test",
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(user.id);

    return user;
  }

  //************************************************************** */

  async function createOrganization() {
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: {
        name: `Location Test ${suffix}`,
        slug: `location-test-${suffix}`,
      },
    });

    organizationIds.push(organization.id);

    return organization;
  }

  //************************************************************** */

  async function createMember(
    targetOrganizationId: string,
    role: "OWNER" | "TECHNICIAN" = "TECHNICIAN",
  ) {
    const user = await createUser();

    const membership = await prisma.membership.create({
      data: {
        organizationId: targetOrganizationId,
        userId: user.id,
        role,
        status: "ACTIVE",
      },
    });

    return membership;
  }

  //************************************************************** */

  async function createLocation(
    targetOrganizationId: string,
    code: string,
  ) {
    return prisma.shopLocation.create({
      data: {
        organizationId: targetOrganizationId,
        name: `Shop ${code}`,
        code,
        status: "ACTIVE",
        isDefault: false,
      },
    });
  }

  //************************************************************** */

  async function setPlan(
    planId: "starter" | "business" | "pro",
  ) {
    const unitAmount = {
      starter: 8_900,
      business: 18_900,
      pro: 29_900,
    }[planId];

    await prisma.organizationBilling.update({
      where: {
        organizationId,
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

  beforeEach(async () => {
    const organization = await createOrganization();

    organizationId = organization.id;

    const owner = await createMember(
      organizationId,
      "OWNER",
    );

    ownerActor = {
      organizationId,
      membershipId: owner.id,
      role: "OWNER",
    };

    const location = await prisma.shopLocation.create({
      data: {
        organizationId,
        name: "Main Shop",
        code: "MAIN",
        isDefault: true,
        status: "ACTIVE",
      },
    });

    defaultLocationId = location.id;

    await prisma.organizationBilling.create({
      data: {
        organizationId,
        planId: "starter",
        status: "TRIALING",
        currency: "usd",
        unitAmount: 8_900,
      },
    });
  });

  //************************************************************** */

  afterEach(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: {
          in: organizationIds,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });

    organizationIds.length = 0;
    userIds.length = 0;
  });

  //************************************************************** */

  it("rejects a second Starter location", async () => {
    await assert.rejects(
      createShopLocationRecord(organizationId, {
        name: "Second Shop",
        code: "SECOND",
      }),
      {
        code: "BILLING_LOCATION_CAPACITY_EXCEEDED",
      },
    );

    const count = await prisma.shopLocation.count({
      where: {
        organizationId,
      },
    });

    assert.equal(count, 1);
  });

  //************************************************************** */

  it("rejects a second Business location", async () => {
    await setPlan("business");

    await assert.rejects(
      createShopLocationRecord(organizationId, {
        name: "Second Shop",
        code: "SECOND",
      }),
      {
        code: "BILLING_LOCATION_CAPACITY_EXCEEDED",
      },
    );
  });

  //************************************************************** */

  it("allows two Pro locations but rejects a third unpaid location", async () => {
    await setPlan("pro");

    const second = await createShopLocationRecord(
      organizationId,
      {
        name: "Second Shop",
        code: "SECOND",
      },
    );

    assert.equal(second.organizationId, organizationId);
    assert.equal(second.status, "ACTIVE");
    assert.equal(second.isDefault, false);

    await assert.rejects(
      createShopLocationRecord(organizationId, {
        name: "Third Shop",
        code: "THIRD",
      }),
      {
        code: "BILLING_LOCATION_CAPACITY_EXCEEDED",
      },
    );

    const count = await prisma.shopLocation.count({
      where: {
        organizationId,
        status: "ACTIVE",
      },
    });

    assert.equal(count, 2);
  });

  //************************************************************** */

  it("rejects duplicate location codes within an organization", async () => {
    await setPlan("pro");

    await assert.rejects(
      createShopLocationRecord(organizationId, {
        name: "Another Shop",
        code: "MAIN",
      }),
      {
        code: "SHOP_LOCATION_ALREADY_EXISTS",
      },
    );
  });

  //************************************************************** */

  it("allows an employee to work at multiple locations", async () => {
    const employee = await createMember(organizationId);

    const secondLocation = await createLocation(
      organizationId,
      "SECOND",
    );

    await replaceLocationEmployeeAssignments(
      organizationId,
      defaultLocationId,
      [employee.id],
    );

    await replaceLocationEmployeeAssignments(
      organizationId,
      secondLocation.id,
      [employee.id],
    );

    const assignments =
      await prisma.membershipLocation.findMany({
        where: {
          organizationId,
          membershipId: employee.id,
        },
      });

    assert.equal(assignments.length, 2);

    const uniqueMembershipIds = new Set(
      assignments.map((assignment) => assignment.membershipId),
    );

    assert.equal(uniqueMembershipIds.size, 1);
  });

  //************************************************************** */

  it("rejects employees from another organization", async () => {
    const otherOrganization = await createOrganization();

    const outsideEmployee = await createMember(
      otherOrganization.id,
    );

    await assert.rejects(
      replaceLocationEmployeeAssignments(
        organizationId,
        defaultLocationId,
        [outsideEmployee.id],
      ),
      {
        code: "INVALID_LOCATION_EMPLOYEE",
      },
    );

    const count = await prisma.membershipLocation.count({
      where: {
        organizationId,
        shopLocationId: defaultLocationId,
      },
    });

    assert.equal(count, 0);
  });

  //************************************************************** */

  it("rejects assignments to a location in another organization", async () => {
    const otherOrganization = await createOrganization();

    const outsideLocation = await createLocation(
      otherOrganization.id,
      "OUTSIDE",
    );

    const employee = await createMember(organizationId);

    await assert.rejects(
      replaceLocationEmployeeAssignments(
        organizationId,
        outsideLocation.id,
        [employee.id],
      ),
      {
        code: "SHOP_LOCATION_NOT_FOUND",
      },
    );
  });

  //************************************************************** */

  it("rejects duplicate employee assignments", async () => {
    const employee = await createMember(organizationId);

    await assert.rejects(
      replaceLocationEmployeeAssignments(
        organizationId,
        defaultLocationId,
        [employee.id, employee.id],
      ),
      {
        code: "DUPLICATE_LOCATION_EMPLOYEE",
      },
    );
  });

  //************************************************************** */

  it("prevents non-owners from creating locations", async () => {
    await setPlan("pro");

    const employee = await createMember(organizationId);

    const employeeActor: MembershipActorContext = {
      organizationId,
      membershipId: employee.id,
      role: "TECHNICIAN",
    };

    await assert.rejects(
      createOrganizationLocation(
        organizationId,
        {
          name: "Unauthorized Shop",
          code: "UNAUTHORIZED",
        },
        employeeActor,
      ),
      {
        code: "LOCATION_CREATION_FORBIDDEN",
      },
    );
  });

  //************************************************************** */

  it("prevents non-owners from changing assignments", async () => {
    const employee = await createMember(organizationId);

    const employeeActor: MembershipActorContext = {
      organizationId,
      membershipId: employee.id,
      role: "TECHNICIAN",
    };

    await assert.rejects(
      assignOrganizationLocationEmployees(
        organizationId,
        defaultLocationId,
        [],
        employeeActor,
      ),
      {
        code: "LOCATION_ASSIGNMENT_FORBIDDEN",
      },
    );
  });

  //************************************************************** */

  it("prevents reading locations from another organization", async () => {
    const otherOrganization = await createOrganization();

    const outsideLocation = await createLocation(
      otherOrganization.id,
      "OUTSIDE",
    );

    await assert.rejects(
      getOrganizationLocation(
        organizationId,
        outsideLocation.id,
        ownerActor,
      ),
      {
        code: "SHOP_LOCATION_NOT_FOUND",
      },
    );
  });

  //************************************************************** */
});
