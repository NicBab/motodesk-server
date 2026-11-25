
import { prisma } from "../../../src/config/prisma.js";

//************************************************************** */

export async function defaultShopLocationId(
  organizationId: string,
): Promise<string> {
  const location = await prisma.shopLocation.findFirstOrThrow({
    where: {
      organizationId,
      isDefault: true,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  return location.id;
}

//************************************************************** */

export async function scopeRepairOrderFixture(
  organizationId: string,
  repairOrderId: string,
): Promise<void> {
  const shopLocationId =
    await defaultShopLocationId(organizationId);

  const result = await prisma.repairOrder.updateMany({
    where: {
      id: repairOrderId,
      organizationId,
    },
    data: {
      shopLocationId,
    },
  });

  if (result.count !== 1) {
    throw new Error(
      "Repair order fixture location assignment failed.",
    );
  }
}

//************************************************************** */
