import { AppError } from "../../platform/errors/app-error.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../audit/audit.constants.js";
import { createAuditLog } from "../audit/audit.service.js";
import {
  createOrganizationWithOwner,
  findOrganizationById,
  findOrganizationBySlug,
  findOrganizationsForUser,
  updateOrganizationRecord,
} from "./organization.repository.js";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from "./organization.types.js";

//************************************************************** */

export async function createOrganization(
  input: CreateOrganizationInput,
) {
  const existingOrganization =
    await findOrganizationBySlug(
      input.slug,
    );

  if (existingOrganization) {
    throw new AppError(
      409,
      "An organization with this slug already exists.",
      {
        code: "ORGANIZATION_SLUG_TAKEN",
      },
    );
  }

  const organization =
    await createOrganizationWithOwner(
      input,
    );

  await createAuditLog({
    action:
      AUDIT_ACTIONS.ORGANIZATION_CREATED,
    entityType:
      AUDIT_ENTITY_TYPES.ORGANIZATION,
    entityId: organization.id,
    actor: {
      userId: input.ownerUserId,
      organizationId: organization.id,
    },
    after: organization,
  });

  return organization;
}

//************************************************************** */

export async function getOrganizationById(
  organizationId: string,
) {
  const organization =
    await findOrganizationById(
      organizationId,
    );

  if (!organization) {
    throw new AppError(
      404,
      "Organization not found.",
      {
        code: "ORGANIZATION_NOT_FOUND",
      },
    );
  }

  return organization;
}

//************************************************************** */

export async function getOrganizationsForUser(
  userId: string,
) {
  return findOrganizationsForUser(
    userId,
  );
}

//************************************************************** */

export async function updateOrganization(
  organizationId: string,
  input: UpdateOrganizationInput,
  actorUserId: string,
) {
  const existingOrganization =
    await getOrganizationById(
      organizationId,
    );

  const updatedOrganization =
    await updateOrganizationRecord(
      organizationId,
      input,
    );

  await createAuditLog({
    action:
      AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    entityType:
      AUDIT_ENTITY_TYPES.ORGANIZATION,
    entityId: organizationId,
    actor: {
      userId: actorUserId,
      organizationId,
    },
    before: existingOrganization,
    after: updatedOrganization,
  });

  return updatedOrganization;
}