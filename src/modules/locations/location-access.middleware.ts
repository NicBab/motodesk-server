import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "../auth/index.js";
import { AppError } from "../../platform/errors/app-error.js";
import { getRequestContext } from "../../platform/request/request.context.js";
import { requireShopLocationAccess } from "./location-access.service.js";

//************************************************************** */

type AuthorizedShopLocation = Awaited<ReturnType<typeof requireShopLocationAccess>>;

const authorizedLocations = new WeakMap<AuthenticatedRequest, AuthorizedShopLocation>();

//************************************************************** */

export async function requireLocationAccess(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  authorizedLocations.delete(request);

  try {
    const organizationId = request.params.organizationId;
    const membership = getRequestContext().membership;

    if (typeof organizationId !== "string" || !organizationId.trim()) {
      throw new AppError(400, "A valid organization ID is required.", {
        code: "ORGANIZATION_ID_REQUIRED",
      });
    }

    if (!membership || membership.organizationId !== organizationId || membership.status !== "ACTIVE") {
      throw new AppError(403, "Organization membership is required.", {
        code: "ORGANIZATION_MEMBERSHIP_REQUIRED",
      });
    }

    const locationId = request.get("x-shop-location-id");

    if (!locationId || !locationId.trim() || locationId.includes(",")) {
      throw new AppError(400, "A valid shop location ID is required.", {
        code: "SHOP_LOCATION_ID_REQUIRED",
      });
    }

    const location = await requireShopLocationAccess(
      organizationId,
      locationId.trim(),
      {
        organizationId: membership.organizationId,
        membershipId: membership.id,
        role: membership.role,
      },
    );

    authorizedLocations.set(request, location);
  } catch (error) {
    next(error);
    return;
  }

  next();
}

//************************************************************** */

export function requireAuthorizedShopLocation(
  request: AuthenticatedRequest,
): AuthorizedShopLocation {
  const location = authorizedLocations.get(request);

  if (!location || location.organizationId !== request.params.organizationId) {
    throw new AppError(500, "Authorized shop location context is unavailable.", {
      code: "SHOP_LOCATION_CONTEXT_UNAVAILABLE",
    });
  }

  return location;
}

//************************************************************** */
