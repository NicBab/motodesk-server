import type { Response } from "express";

import { AppError } from "../../common/errors/app-error.js";
import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import type {
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
} from "./organization.schemas.js";
import {
  createOrganization,
  getOrganizationById,
  updateOrganization,
} from "./organization.service.js";

//************************************************************** */
function requireAuthenticatedUserId(
  request: AuthenticatedRequest,
): string {
  const userId = request.authenticatedUser?.id;

  if (!userId) {
    throw new AppError(
      401,
      "Authentication required.",
      {
        code: "AUTHENTICATION_REQUIRED",
      },
    );
  }

  return userId;
}

//************************************************************** */

function requireOrganizationId(
  request: AuthenticatedRequest,
): string {
  const organizationId =
    request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(
      400,
      "A valid organization ID is required.",
      {
        code: "ORGANIZATION_ID_REQUIRED",
      },
    );
  }

  return organizationId;
}

//************************************************************** */

export async function createOrganizationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const body =
    request.body as CreateOrganizationRequest;

  const organization =
    await createOrganization({
      name: body.name,
      slug: body.slug,
      ownerUserId:
        requireAuthenticatedUserId(request),

      ...(body.email !== undefined
        ? {
            email: body.email,
          }
        : {}),

      ...(body.phone !== undefined
        ? {
            phone: body.phone,
          }
        : {}),
    });

  response.status(201).json({
    data: organization,
  });
}

//************************************************************** */
export async function getOrganizationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organization =
    await getOrganizationById(
      requireOrganizationId(request),
    );

  response.status(200).json({
    data: organization,
  });
}

//************************************************************** */
export async function updateOrganizationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const userId =
    requireAuthenticatedUserId(request);

  const body =
    request.body as UpdateOrganizationRequest;

  const organization =
    await updateOrganization(
      organizationId,
      {
        ...(body.name !== undefined
          ? {
              name: body.name,
            }
          : {}),

        ...(body.email !== undefined
          ? {
              email: body.email,
            }
          : {}),

        ...(body.phone !== undefined
          ? {
              phone: body.phone,
            }
          : {}),
      },
      userId,
    );

  response.status(200).json({
    data: organization,
  });
}

//************************************************************** */