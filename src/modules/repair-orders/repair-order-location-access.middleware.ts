
import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "../auth/index.js";

import { prisma } from "../../config/prisma.js";

import { AppError } from "../../platform/errors/app-error.js";

import { requireAuthorizedShopLocation } from "../locations/location-access.middleware.js";

//************************************************************** */

export async function requireRepairOrderLocationAccess(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = request.params.organizationId;

    const repairOrderId = request.params.repairOrderId;

    if (
      typeof organizationId !== "string" ||
      !organizationId.trim()
    ) {
      throw new AppError(
        400,
        "A valid organization ID is required.",
        {
          code: "ORGANIZATION_ID_REQUIRED",
        },
      );
    }

    if (
      typeof repairOrderId !== "string" ||
      !repairOrderId.trim()
    ) {
      throw new AppError(
        400,
        "A valid repair order ID is required.",
        {
          code: "REPAIR_ORDER_ID_REQUIRED",
        },
      );
    }

    const shopLocation =
      requireAuthorizedShopLocation(request);

    const repairOrder = await prisma.repairOrder.findFirst({
      where: {
        id: repairOrderId,
        organizationId,
        shopLocationId: shopLocation.id,
      },
      select: {
        id: true,
      },
    });

    if (!repairOrder) {
      throw new AppError(
        404,
        "Repair order not found.",
        {
          code: "REPAIR_ORDER_NOT_FOUND",
        },
      );
    }
  } catch (error) {
    next(error);
    return;
  }

  next();
}

//************************************************************** */
