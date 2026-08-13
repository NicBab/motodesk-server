import bcrypt from "bcryptjs";

import {
  MembershipRole,
  MembershipStatus,
} from "../src/generated/prisma/client.js";

import {
  prisma,
} from "../src/config/prisma.js";

//************************************************************** */

const DEV_USER_EMAIL =
  "dev.owner@motodesk.local";

const DEV_USER_PASSWORD =
  "MotoDeskDev123!";

const DEV_ORGANIZATION_SLUG =
  "motodesk-dev-shop";

//************************************************************** */

async function main(): Promise<void> {
  const passwordHash =
    await bcrypt.hash(
      DEV_USER_PASSWORD,
      12,
    );

  const user =
    await prisma.user.upsert({
      where: {
        email: DEV_USER_EMAIL,
      },

      update: {
        passwordHash,
        firstName: "Dev",
        lastName: "Owner",
        isActive: true,
        emailVerifiedAt: new Date(),
      },

      create: {
        email: DEV_USER_EMAIL,
        passwordHash,
        firstName: "Dev",
        lastName: "Owner",
        phone: null,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });

  const organization =
    await prisma.organization.upsert({
      where: {
        slug:
          DEV_ORGANIZATION_SLUG,
      },

      update: {
        name: "MotoDesk Dev Shop",
        email:
          "devshop@motodesk.local",
        phone:
          "3375550100",
      },

      create: {
        name: "MotoDesk Dev Shop",
        slug:
          DEV_ORGANIZATION_SLUG,
        email:
          "devshop@motodesk.local",
        phone:
          "3375550100",
      },
    });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId:
          user.id,
        organizationId:
          organization.id,
      },
    },

    update: {
      role:
        MembershipRole.OWNER,
      status:
        MembershipStatus.ACTIVE,
    },

    create: {
      userId:
        user.id,
      organizationId:
        organization.id,
      role:
        MembershipRole.OWNER,
      status:
        MembershipStatus.ACTIVE,
    },
  });

  console.log("");
  console.log(
    "MotoDesk development seed ready.",
  );
  console.log(
    `Email: ${DEV_USER_EMAIL}`,
  );
  console.log(
    `Password: ${DEV_USER_PASSWORD}`,
  );
  console.log(
    `Organization ID: ${organization.id}`,
  );
  console.log(
    `Organization slug: ${organization.slug}`,
  );
  console.log("");
}

//************************************************************** */

main()
  .catch((error) => {
    console.error(
      "Development seed failed:",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });