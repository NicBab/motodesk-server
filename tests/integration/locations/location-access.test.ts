import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { prisma } from "../../../src/config/prisma.js";
import {
  listAccessibleShopLocations,
  requireShopLocationAccess,
} from "../../../src/modules/locations/location-access.service.js";
import type { MembershipActorContext } from "../../../src/modules/memberships/membership.types.js";

//************************************************************** */

describe("Shop location access integration", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const denied = { code: "SHOP_LOCATION_ACCESS_DENIED" };
  let organizationId: string;
  let mainId: string;
  let secondId: string;
  let owner: MembershipActorContext;
  let technician: MembershipActorContext;
  let admin: MembershipActorContext;

  async function createOrganization() {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Location Access ${suffix}`, slug: `location-access-${suffix}` },
    });
    organizationIds.push(organization.id);
    return organization.id;
  }

  async function createMember(orgId: string, role: MembershipActorContext["role"]): Promise<MembershipActorContext> {
    const user = await prisma.user.create({
      data: {
        email: `location-access-${randomUUID()}@example.com`,
        firstName: "Location",
        lastName: "Access",
        emailVerifiedAt: new Date(),
        isActive: true,
      },
    });
    userIds.push(user.id);
    const membership = await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, role, status: "ACTIVE" },
    });
    return { organizationId: orgId, membershipId: membership.id, role };
  }

  async function createLocation(orgId: string, code: string, isDefault = false) {
    return prisma.shopLocation.create({
      data: { organizationId: orgId, name: `Shop ${code}`, code, isDefault, status: "ACTIVE" },
    });
  }

  async function assign(actor: MembershipActorContext, shopLocationId: string) {
    await prisma.membershipLocation.create({
      data: { organizationId: actor.organizationId, membershipId: actor.membershipId, shopLocationId },
    });
  }

  beforeEach(async () => {
    organizationId = await createOrganization();
    owner = await createMember(organizationId, "OWNER");
    technician = await createMember(organizationId, "TECHNICIAN");
    admin = await createMember(organizationId, "ADMIN");
    mainId = (await createLocation(organizationId, "MAIN", true)).id;
    secondId = (await createLocation(organizationId, "SECOND")).id;
    await assign(technician, mainId);
    await assign(admin, secondId);
  });

  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    organizationIds.length = 0;
    userIds.length = 0;
  });

  it("allows owners to access all active shops without assignments", async () => {
    const locations = await listAccessibleShopLocations(organizationId, owner);
    assert.deepEqual(locations.map((location) => location.id), [mainId, secondId]);
    assert.equal((await requireShopLocationAccess(organizationId, secondId, owner)).id, secondId);
  });

  it("restricts technicians to assigned shops", async () => {
    assert.deepEqual((await listAccessibleShopLocations(organizationId, technician)).map((location) => location.id), [mainId]);
    assert.equal((await requireShopLocationAccess(organizationId, mainId, technician)).id, mainId);
    await assert.rejects(requireShopLocationAccess(organizationId, secondId, technician), denied);
  });

  it("restricts administrators to assigned shops", async () => {
    assert.deepEqual((await listAccessibleShopLocations(organizationId, admin)).map((location) => location.id), [secondId]);
    await assert.rejects(requireShopLocationAccess(organizationId, mainId, admin), denied);
  });

  it("allows multiple assignments for one membership", async () => {
    await assign(technician, secondId);
    assert.deepEqual((await listAccessibleShopLocations(organizationId, technician)).map((location) => location.id), [mainId, secondId]);
  });

  it("denies shop access to unassigned employees", async () => {
    const actor = await createMember(organizationId, "PARTS");
    assert.deepEqual(await listAccessibleShopLocations(organizationId, actor), []);
    await assert.rejects(requireShopLocationAccess(organizationId, mainId, actor), denied);
  });

  it("excludes archived locations even for owners and assigned employees", async () => {
    await prisma.shopLocation.update({ where: { id: secondId }, data: { status: "ARCHIVED" } });
    assert.deepEqual((await listAccessibleShopLocations(organizationId, owner)).map((location) => location.id), [mainId]);
    assert.deepEqual(await listAccessibleShopLocations(organizationId, admin), []);
    await assert.rejects(requireShopLocationAccess(organizationId, secondId, owner), denied);
    await assert.rejects(requireShopLocationAccess(organizationId, secondId, admin), denied);
  });

  it("denies cross-organization location and membership access", async () => {
    const otherOrg = await createOrganization();
    const otherShop = await createLocation(otherOrg, "OTHER", true);
    await assert.rejects(requireShopLocationAccess(organizationId, otherShop.id, owner), denied);
    await assert.rejects(listAccessibleShopLocations(otherOrg, owner), denied);
    await assert.rejects(listAccessibleShopLocations(otherOrg, { ...owner, organizationId: otherOrg }), denied);
  });

  it("denies suspended memberships", async () => {
    await prisma.membership.update({ where: { id: technician.membershipId }, data: { status: "SUSPENDED" } });
    await assert.rejects(listAccessibleShopLocations(organizationId, technician), denied);
    await assert.rejects(requireShopLocationAccess(organizationId, mainId, technician), denied);
  });

  it("denies inactive users", async () => {
    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: technician.membershipId } });
    await prisma.user.update({ where: { id: membership.userId }, data: { isActive: false } });
    await assert.rejects(listAccessibleShopLocations(organizationId, technician), denied);
  });

  it("denies access to archived organizations", async () => {
    await prisma.organization.update({ where: { id: organizationId }, data: { status: "ARCHIVED" } });
    await assert.rejects(listAccessibleShopLocations(organizationId, owner), denied);
    await assert.rejects(requireShopLocationAccess(organizationId, mainId, technician), denied);
  });

  it("uses the current database role instead of a forged or stale actor role", async () => {
    const actor: MembershipActorContext = { ...technician, role: "OWNER" };
    await assert.rejects(requireShopLocationAccess(organizationId, secondId, actor), denied);
    await prisma.membership.update({ where: { id: owner.membershipId }, data: { role: "ADMIN" } });
    assert.deepEqual(await listAccessibleShopLocations(organizationId, owner), []);
  });

  it("revokes access when an assignment is removed", async () => {
    await prisma.membershipLocation.deleteMany({ where: { membershipId: technician.membershipId, shopLocationId: mainId } });
    await assert.rejects(requireShopLocationAccess(organizationId, mainId, technician), denied);
  });

  it("rejects a missing or blank location ID", async () => {
    for (const id of ["", "   "]) {
      await assert.rejects(requireShopLocationAccess(organizationId, id, owner), { code: "SHOP_LOCATION_ID_REQUIRED" });
    }
  });
});
