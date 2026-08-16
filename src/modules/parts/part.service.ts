import { AppError } from "../../platform/errors/app-error.js";

import {
  archivePartRecord,
  createPartRecord,
  findPartById,
  findPartByPartNumber,
  findPartsByOrganization,
  updatePartRecord,
} from "./part.repository.js";

import type {
  CreatePartInput,
  ListPartsQueryInput,
  UpdatePartInput,
} from "./part.schemas.js";

//************************************************************** */

export async function createPart(
  organizationId: string,
  membershipId: string | null,
  input: CreatePartInput,
) {
  const existingPart =
    await findPartByPartNumber(
      organizationId,
      input.partNumber,
    );

  if (existingPart) {
    throw new AppError(
      409,
      "A part with this part number already exists.",
      {
        code: "PART_NUMBER_TAKEN",
      },
    );
  }

  return createPartRecord(
    organizationId,
    input,
    membershipId,
  );
}

//************************************************************** */

export async function getPartById(
  organizationId: string,
  partId: string,
) {
  const part =
    await findPartById(
      organizationId,
      partId,
    );

  if (!part) {
    throw new AppError(
      404,
      "Part not found.",
      {
        code: "PART_NOT_FOUND",
      },
    );
  }

  return part;
}

//************************************************************** */

export async function listParts(
  organizationId: string,
  query: ListPartsQueryInput,
) {
  return findPartsByOrganization(
    organizationId,
    query,
  );
}

//************************************************************** */

export async function updatePart(
  organizationId: string,
  partId: string,
  input: UpdatePartInput,
) {
  const existingPart =
    await findPartById(
      organizationId,
      partId,
    );

  if (!existingPart) {
    throw new AppError(
      404,
      "Part not found.",
      {
        code: "PART_NOT_FOUND",
      },
    );
  }

  if (
    input.partNumber !== undefined &&
    input.partNumber !==
      existingPart.partNumber
  ) {
    const duplicatePart =
      await findPartByPartNumber(
        organizationId,
        input.partNumber,
      );

    if (duplicatePart) {
      throw new AppError(
        409,
        "A part with this part number already exists.",
        {
          code: "PART_NUMBER_TAKEN",
        },
      );
    }
  }

  await updatePartRecord(
    organizationId,
    partId,
    input,
  );

  return getPartById(
    organizationId,
    partId,
  );
}

//************************************************************** */

export async function archivePart(
  organizationId: string,
  partId: string,
) {
  const existingPart =
    await findPartById(
      organizationId,
      partId,
    );

  if (!existingPart) {
    throw new AppError(
      404,
      "Part not found.",
      {
        code: "PART_NOT_FOUND",
      },
    );
  }

  if (!existingPart.isActive) {
    throw new AppError(
      400,
      "Part is already archived.",
      {
        code: "PART_ALREADY_ARCHIVED",
      },
    );
  }

  await archivePartRecord(
    organizationId,
    partId,
  );

  return getPartById(
    organizationId,
    partId,
  );
}