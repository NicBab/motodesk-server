import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

async function switchOrganization(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
) {
  const response = await agent.post("/api/v1/auth/switch-organization").send({
    organizationId,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
}

//************************************************************** */

describe("Audit Log tenant isolation integration", () => {
  it("prevents another organization's audit events from leaking through audit-log queries", async () => {
    const {
      agent,

      organizationId: organizationAId,
    } = await createAuthenticatedAgent();

    const suffix = randomUUID();

    //************************************************************** */
    // ORGANIZATION B

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `Audit Tenant B ${suffix}`,

        slug: `audit-tenant-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId = organizationBResponse.body.data.id;

    //************************************************************** */
    // GENERATE A DISTINCT B AUDIT EVENT

    await switchOrganization(agent, organizationBId);

    const customerBResponse = await agent
      .post(`/api/v1/organizations/${organizationBId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "B",

        lastName: `Audit-Protected-${suffix}`,
      });

    assert.equal(customerBResponse.status, 201);

    const customerB = customerBResponse.body.data;

    //************************************************************** */
    // GENERATE A DISTINCT A AUDIT EVENT

    await switchOrganization(agent, organizationAId);

    const customerAResponse = await agent
      .post(`/api/v1/organizations/${organizationAId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "A",

        lastName: `Audit-Local-${suffix}`,
      });

    assert.equal(customerAResponse.status, 201);

    const customerA = customerAResponse.body.data;

    //************************************************************** */
    // VERIFY FIXTURE AUDIT EVENTS EXIST IN DATABASE

    const auditEventsB = await prisma.auditLog.findMany({
      where: {
        organizationId: organizationBId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditEventsB.length > 0);

    const auditEventsA = await prisma.auditLog.findMany({
      where: {
        organizationId: organizationAId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditEventsA.length > 0);

    //************************************************************** */
    // BASIC AUDIT LIST ISOLATION

    const listResponse = await agent.get(
      `/api/v1/organizations/${organizationAId}/audit?page=1&pageSize=100`,
    );

    assert.equal(listResponse.status, 200);

    assert.equal(listResponse.body.success, true);

    const listData = listResponse.body.data;

    const serializedList = JSON.stringify(listData);

    //************************************************************** */
    // No B audit-log database ID may appear in A's response.

    for (const auditEventB of auditEventsB) {
      assert.equal(serializedList.includes(auditEventB.id), false);
    }

    //************************************************************** */
    // No protected B resource ID may appear anywhere in A's audit
    // response.

    assert.equal(serializedList.includes(customerB.id), false);

    //************************************************************** */
    // B organization identifier must not leak either.

    assert.equal(serializedList.includes(organizationBId), false);

    //************************************************************** */
    // Every returned event that exposes organizationId must belong
    // to A.

    const returnedEvents = Array.isArray(listData)
      ? listData
      : (listData.items ?? listData.logs ?? listData.events ?? []);

    assert.ok(Array.isArray(returnedEvents));

    for (const event of returnedEvents) {
      if ("organizationId" in event) {
        assert.equal(event.organizationId, organizationAId);
      }
    }

    //************************************************************** */
    // RESOURCE-ID FILTER ISOLATION
    //
    // Knowing the exact resource ID from Organization B must not allow
    // Organization A to retrieve B's audit event.

    const resourceFilterResponse = await agent
      .get(`/api/v1/organizations/${organizationAId}/audit`)
      .query({
        page: 1,

        pageSize: 100,

        resourceId: customerB.id,
      });

    assert.equal(resourceFilterResponse.status, 200);

    const resourceFilterJson = JSON.stringify(resourceFilterResponse.body);

    assert.equal(resourceFilterJson.includes(customerB.id), false);

    assert.equal(resourceFilterJson.includes(organizationBId), false);

    for (const auditEventB of auditEventsB) {
      assert.equal(resourceFilterJson.includes(auditEventB.id), false);
    }

    //************************************************************** */
    // LOCAL SANITY
    //
    // At least one A event exists independently of the API response.
    // This proves we're not passing merely because no audit records
    // exist at all.

    assert.equal(
      auditEventsA.some((event) => event.organizationId === organizationAId),
      true,
    );

    //************************************************************** */
    // DATABASE TENANT SANITY

    const storedCustomerB = await prisma.customer.findUniqueOrThrow({
      where: {
        id: customerB.id,
      },
    });

    assert.equal(storedCustomerB.organizationId, organizationBId);

    const storedCustomerA = await prisma.customer.findUniqueOrThrow({
      where: {
        id: customerA.id,
      },
    });

    assert.equal(storedCustomerA.organizationId, organizationAId);

    //************************************************************** */
    // Explicit DB invariant:
    // B has audit records, but none are scoped to A.

    const crossTenantAuditCount = await prisma.auditLog.count({
      where: {
        organizationId: organizationAId,

        id: {
          in: auditEventsB.map((event) => event.id),
        },
      },
    });

    assert.equal(crossTenantAuditCount, 0);
  });
});

//************************************************************** */
