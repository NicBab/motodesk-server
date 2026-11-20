
import assert from "node:assert/strict";

import {
  after,
  before,
  describe,
  it,
} from "node:test";

import request from "supertest";

import { app } from "../../../src/app.js";

import { prisma } from "../../../src/config/prisma.js";

import {
  MembershipRole,
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import { hashPassword } from "../../../src/modules/auth/security/password.service.js";

//************************************************************** */

const TEST_SUFFIX = `${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 10)}`;

const TEST_EMAIL =
  `organization-switch-${TEST_SUFFIX}@motodesk.test`;

const TEST_PASSWORD =
  "MotoDeskOrganizationSwitch123!";

let testUserId = "";

let organizationAId = "";

let organizationBId = "";

let unauthorizedOrganizationId = "";

let membershipBId = "";

//************************************************************** */

before(async () => {
  const passwordHash =
    await hashPassword(TEST_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,

      passwordHash,

      firstName: "Organization",

      lastName: "Switch",

      isActive: true,

      emailVerifiedAt: new Date(),
    },
  });

  testUserId = user.id;

  const organizationA =
    await prisma.organization.create({
      data: {
        name: "Organization Switch Test A",

        slug: `switch-test-a-${TEST_SUFFIX}`,
      },
    });

  organizationAId = organizationA.id;

  const organizationB =
    await prisma.organization.create({
      data: {
        name: "Organization Switch Test B",

        slug: `switch-test-b-${TEST_SUFFIX}`,
      },
    });

  organizationBId = organizationB.id;

  const unauthorizedOrganization =
    await prisma.organization.create({
      data: {
        name: "Unauthorized Switch Test",

        slug: `switch-test-unauthorized-${TEST_SUFFIX}`,
      },
    });

  unauthorizedOrganizationId =
    unauthorizedOrganization.id;

  await prisma.membership.create({
    data: {
      userId: testUserId,

      organizationId: organizationAId,

      role: MembershipRole.OWNER,

      status: MembershipStatus.ACTIVE,

      createdAt: new Date(Date.now() - 60_000),
    },
  });

  const membershipB =
    await prisma.membership.create({
      data: {
        userId: testUserId,

        organizationId: organizationBId,

        role: MembershipRole.ADMIN,

        status: MembershipStatus.ACTIVE,
      },
    });

  membershipBId = membershipB.id;
});

//************************************************************** */

after(async () => {
  const organizationIds = [
    organizationAId,
    organizationBId,
    unauthorizedOrganizationId,
  ].filter(Boolean);

  if (testUserId) {
    await prisma.auditLog.deleteMany({
      where: {
        actorUserId: testUserId,
      },
    });

    await prisma.session.deleteMany({
      where: {
        userId: testUserId,
      },
    });

    await prisma.authToken.deleteMany({
      where: {
        userId: testUserId,
      },
    });

    await prisma.membership.deleteMany({
      where: {
        userId: testUserId,
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: testUserId,
      },
    });
  }

  await prisma.organization.deleteMany({
    where: {
      id: {
        in: organizationIds,
      },
    },
  });
});

//************************************************************** */

async function createTestAgent() {
  const agent = request.agent(app);

  const response = await agent
    .post("/api/v1/auth/login")
    .send({
      email: TEST_EMAIL,

      password: TEST_PASSWORD,
    });

  assert.equal(
    response.status,
    200,
    JSON.stringify(response.body),
  );

  assert.equal(
    response.body.data.membership.organizationId,
    organizationAId,
  );

  return agent;
}

//************************************************************** */

describe(
  "Organization switch persistence integration",
  () => {
    it(
      "initializes the selected organization during login",
      async () => {
        await createTestAgent();

        const session =
          await prisma.session.findFirst({
            where: {
              userId: testUserId,
            },

            orderBy: {
              createdAt: "desc",
            },
          });

        assert.ok(session);

        assert.equal(
          session.activeOrganizationId,
          organizationAId,
        );
      },
    );

    //************************************************************** */

    it(
      "persists the selected organization during an authorized switch",
      async () => {
        const agent =
          await createTestAgent();

        const response = await agent
          .post("/api/v1/auth/switch-organization")
          .send({
            organizationId: organizationBId,
          });

        assert.equal(
          response.status,
          200,
          JSON.stringify(response.body),
        );

        assert.equal(
          response.body.data.membership.organizationId,
          organizationBId,
        );

        assert.equal(
          response.body.data.membership.role,
          MembershipRole.ADMIN,
        );

        const session =
          await prisma.session.findFirst({
            where: {
              userId: testUserId,
            },

            orderBy: {
              createdAt: "desc",
            },
          });

        assert.ok(session);

        assert.equal(
          session.activeOrganizationId,
          organizationBId,
        );
      },
    );

    //************************************************************** */

    it(
      "preserves the selected organization across refresh-token rotations",
      async () => {
        const agent =
          await createTestAgent();

        const switchResponse = await agent
          .post("/api/v1/auth/switch-organization")
          .send({
            organizationId: organizationBId,
          });

        assert.equal(
          switchResponse.status,
          200,
        );

        for (let index = 0; index < 2; index += 1) {
          const refreshResponse = await agent
            .post("/api/v1/auth/refresh");

          assert.equal(
            refreshResponse.status,
            200,
            JSON.stringify(refreshResponse.body),
          );

          assert.equal(
            refreshResponse.body.data.membership.organizationId,
            organizationBId,
          );

          assert.equal(
            refreshResponse.body.data.membership.role,
            MembershipRole.ADMIN,
          );
        }
      },
    );

    //************************************************************** */

    it(
      "maintains independent organization selections across sessions",
      async () => {
        const agentA =
          await createTestAgent();

        const agentB =
          await createTestAgent();

        const switchResponse = await agentA
          .post("/api/v1/auth/switch-organization")
          .send({
            organizationId: organizationBId,
          });

        assert.equal(
          switchResponse.status,
          200,
        );

        const refreshResponseA = await agentA
          .post("/api/v1/auth/refresh");

        const refreshResponseB = await agentB
          .post("/api/v1/auth/refresh");

        assert.equal(
          refreshResponseA.status,
          200,
        );

        assert.equal(
          refreshResponseB.status,
          200,
        );

        assert.equal(
          refreshResponseA.body.data.membership.organizationId,
          organizationBId,
        );

        assert.equal(
          refreshResponseB.body.data.membership.organizationId,
          organizationAId,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects unauthorized organization switches without changing the session context",
      async () => {
        const agent =
          await createTestAgent();

        const switchResponse = await agent
          .post("/api/v1/auth/switch-organization")
          .send({
            organizationId: unauthorizedOrganizationId,
          });

        assert.equal(
          switchResponse.status,
          403,
        );

        const refreshResponse = await agent
          .post("/api/v1/auth/refresh");

        assert.equal(
          refreshResponse.status,
          200,
        );

        assert.equal(
          refreshResponse.body.data.membership.organizationId,
          organizationAId,
        );
      },
    );

    //************************************************************** */

    it(
      "falls back to an active membership when the selected membership is suspended",
      async () => {
        const agent =
          await createTestAgent();

        const switchResponse = await agent
          .post("/api/v1/auth/switch-organization")
          .send({
            organizationId: organizationBId,
          });

        assert.equal(
          switchResponse.status,
          200,
        );

        await prisma.membership.update({
          where: {
            id: membershipBId,
          },

          data: {
            status: MembershipStatus.SUSPENDED,
          },
        });

        try {
          const refreshResponse = await agent
            .post("/api/v1/auth/refresh");

          assert.equal(
            refreshResponse.status,
            200,
            JSON.stringify(refreshResponse.body),
          );

          assert.equal(
            refreshResponse.body.data.membership.organizationId,
            organizationAId,
          );

          assert.equal(
            refreshResponse.body.data.membership.role,
            MembershipRole.OWNER,
          );
        } finally {
          await prisma.membership.update({
            where: {
              id: membershipBId,
            },

            data: {
              status: MembershipStatus.ACTIVE,
            },
          });
        }
      },
    );
  },
);

//************************************************************** */
