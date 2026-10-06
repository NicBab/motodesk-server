import { prisma } from "../src/config/prisma.js";

//************************************************************** */

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2);

  if (argumentsList.length !== 1) {
    throw new Error(
      'Usage: npx tsx scripts/bootstrap-platform-admin.ts "your-existing-account@email.com"',
    );
  }

  const email = argumentsList[0]?.trim().toLowerCase();

  if (!email) {
    throw new Error("An existing account email is required.");
  }

  const user = await prisma.user.findUnique({
    where: { email },

    select: {
      id: true,
      email: true,
      isActive: true,
      emailVerifiedAt: true,
    },
  });

  if (!user) {
    throw new Error(
      "No existing account matches that email. No account was created.",
    );
  }

  if (!user.isActive) {
    throw new Error(
      "The account is disabled. Enable it before granting platform access.",
    );
  }

  if (!user.emailVerifiedAt) {
    throw new Error(
      "Verify the account email through the existing application before granting platform access.",
    );
  }

  const result = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.platformAdmin.findUnique({
      where: { userId: user.id },

      select: {
        id: true,
        role: true,
        isActive: true,
        billingExempt: true,
      },
    });

    if (
      existing?.role === "SUPER_ADMIN" &&
      existing.isActive &&
      existing.billingExempt
    ) {
      return {
        changed: false,
        grantId: existing.id,
      };
    }

    const grant = await transaction.platformAdmin.upsert({
      where: { userId: user.id },

      create: {
        userId: user.id,
        role: "SUPER_ADMIN",
        isActive: true,
        billingExempt: true,
      },

      update: {
        role: "SUPER_ADMIN",
        isActive: true,
        billingExempt: true,
      },

      select: {
        id: true,
      },
    });

    // Use the existing AuditLog table. Persist the grant and its
    // audit event atomically. This CLI action has no authenticated
    // browser actor, organization, session, or request IP.
    await transaction.auditLog.create({
      data: {
        action: "platform_admin.bootstrapped",
        resourceType: "PlatformAdmin",
        resourceId: grant.id,

        metadata: {
          source: "BOOTSTRAP_CLI",
          targetUserId: user.id,

          before: existing
            ? {
                role: existing.role,
                isActive: existing.isActive,
                billingExempt: existing.billingExempt,
              }
            : null,

          after: {
            role: "SUPER_ADMIN",
            isActive: true,
            billingExempt: true,
          },
        },
      },
    });

    return {
      changed: true,
      grantId: grant.id,
    };
  });

  console.log(
    result.changed
      ? "Platform access configured successfully."
      : "Platform access was already configured.",
  );

  console.log(`Account: ${user.email}`);
  console.log(`Grant ID: ${result.grantId}`);
  console.log("Role: SUPER_ADMIN");
  console.log("Billing exemption: enabled");
}

//************************************************************** */

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Platform administrator bootstrap failed.",
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

//************************************************************** */