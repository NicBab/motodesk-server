import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { prisma } from "../../../src/config/prisma.js";
import {
  requireLocationAccess,
  requireAuthorizedShopLocation,
} from "../../../src/modules/locations/location-access.middleware.js";
import type { AuthenticatedRequest } from "../../../src/modules/auth/index.js";
import type { Response } from "express";
import { runWithRequestContext } from "../../../src/platform/request/request.context.js";
import type { RequestContext } from "../../../src/platform/request/request.types.js";
import type { MembershipActorContext } from "../../../src/modules/memberships/membership.types.js";

//************************************************************** */

describe("Shop location middleware integration", () => {
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

  async function invoke(actor: MembershipActorContext, header?: string, orgId = organizationId, existingRequest?: AuthenticatedRequest) {
    const member = await prisma.membership.findUniqueOrThrow({ where: { id: actor.membershipId }, include: { user: true } });
    const context: RequestContext = {
      requestId: randomUUID(), sessionId: randomUUID(), ipAddress: null, userAgent: null,
      user: { id: member.user.id, email: member.user.email, firstName: member.user.firstName, lastName: member.user.lastName, phone: member.user.phone },
      membership: { id: member.id, organizationId: member.organizationId, organizationName: "Test shop", role: member.role, status: member.status },
    };
    const request = existingRequest ?? ({} as AuthenticatedRequest);
    Object.assign(request, { params: { organizationId: orgId }, get: (name: string) => name.toLowerCase() === "x-shop-location-id" ? header : undefined });
    const calls: unknown[] = [];
    await runWithRequestContext(context, () => requireLocationAccess(request, {} as Response, (error?: unknown) => { calls.push(error); }));
    assert.equal(calls.length, 1);
    return { request, error: calls[0] };
  }

  it("stores the authorized owner location for downstream handlers", async () => {
    const result = await invoke(owner, secondId);
    assert.equal(result.error, undefined);
    assert.equal(requireAuthorizedShopLocation(result.request).id, secondId);
  });

  it("allows an assigned technician", async () => {
    const result = await invoke(technician, mainId);
    assert.equal(result.error, undefined);
    assert.equal(requireAuthorizedShopLocation(result.request).id, mainId);
  });

  it("rejects missing, blank and multiple location headers", async () => {
    for (const header of [undefined, "", "   ", `${mainId},${secondId}`]) {
      const result = await invoke(owner, header);
      assert.match(String((result.error as { code?: string })?.code), /^SHOP_LOCATION_ID_REQUIRED$/);
      assert.throws(() => requireAuthorizedShopLocation(result.request), { code: "SHOP_LOCATION_CONTEXT_UNAVAILABLE" });
    }
  });

  it("rejects an unknown location", async () => {
    const result = await invoke(owner, randomUUID());
    assert.equal((result.error as { code?: string })?.code, denied.code);
  });

  it("rejects unassigned locations", async () => {
    const result = await invoke(technician, secondId);
    assert.equal((result.error as { code?: string })?.code, denied.code);
  });

  it("rejects archived locations", async () => {
    await prisma.shopLocation.update({ where: { id: secondId }, data: { status: "ARCHIVED" } });
    const result = await invoke(owner, secondId);
    assert.equal((result.error as { code?: string })?.code, denied.code);
  });

  it("rejects a location from another organization", async () => {
    const otherOrg = await createOrganization();
    const otherShop = await createLocation(otherOrg, "OTHER", true);
    const result = await invoke(owner, otherShop.id);
    assert.equal((result.error as { code?: string })?.code, denied.code);
  });

  it("rejects a mismatched organization context", async () => {
    const otherOrg = await createOrganization();
    const result = await invoke(owner, mainId, otherOrg);
    assert.equal((result.error as { code?: string })?.code, "ORGANIZATION_MEMBERSHIP_REQUIRED");
  });

  it("clears previous authorization when a repeated request fails", async () => {
    const first = await invoke(admin, secondId);
    assert.equal(first.error, undefined);
    const second = await invoke(admin, mainId, organizationId, first.request);
    assert.equal((second.error as { code?: string })?.code, denied.code);
    assert.throws(() => requireAuthorizedShopLocation(second.request), { code: "SHOP_LOCATION_CONTEXT_UNAVAILABLE" });
  });
});
