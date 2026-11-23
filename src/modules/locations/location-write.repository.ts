
import { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  assertOrganizationLocationCapacity,
} from "./location-capacity.service.js";

import type {
  CreateShopLocationInput,
} from "./location.types.js";

//************************************************************** */

export async function createShopLocationRecord(
  organizationId: string,
  input: CreateShopLocationInput,
) {
  return prisma.$transaction(async (transaction) => {
    // Lock and verify capacity before creating a location.
    // The lock remains held until this transaction commits.

    await assertOrganizationLocationCapacity(
      transaction,
      organizationId,
    );

    // Check for conflicting names or codes within this organization.

    const existingLocation =
      await transaction.shopLocation.findFirst({
        where: {
          organizationId,

          OR: [
            { name: input.name },
            { code: input.code },
          ],
        },

        select: {
          id: true,
        },
      });

    if (existingLocation) {
      throw new AppError(
        409,
        "A location with this name or code already exists.",
        {
          code: "SHOP_LOCATION_ALREADY_EXISTS",
        },
      );
    }

    try {
      return await transaction.shopLocation.create({
        data: {
          organizationId,

          name: input.name,
          code: input.code,

          email: input.email ?? null,
          phone: input.phone ?? null,

          addressLine1: input.addressLine1 ?? null,
          addressLine2: input.addressLine2 ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          postalCode: input.postalCode ?? null,

          country: input.country ?? "US",
          timezone: input.timezone ?? "America/Chicago",

          isDefault: false,
          status: "ACTIVE",
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError(
          409,
          "A location with this name or code already exists.",
          {
            code: "SHOP_LOCATION_ALREADY_EXISTS",
          },
        );
      }

      throw error;
    }
  });
}

//************************************************************** */
