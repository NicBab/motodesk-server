import { AppError } from "../../platform/errors/app-error.js";

import {
  archiveVendorRecord,
  createVendorRecord,
  findVendorById,
  findVendorByName,
  findVendorsByOrganization,
  restoreVendorRecord,
  updateVendorRecord,
} from "./vendor.repository.js";

import type {
  CreateVendorInput,
  ListVendorsQueryInput,
  UpdateVendorInput,
} from "./vendor.schemas.js";

//************************************************************** */

export async function createVendor(
  organizationId: string,
  input: CreateVendorInput,
) {
  const existingVendor = await findVendorByName(organizationId, input.name);

  if (existingVendor) {
    throw new AppError(409, "A vendor with this name already exists.", {
      code: "VENDOR_NAME_TAKEN",
    });
  }

  return createVendorRecord(organizationId, input);
}

//************************************************************** */

export async function getVendorById(organizationId: string, vendorId: string) {
  const vendor = await findVendorById(organizationId, vendorId);

  if (!vendor) {
    throw new AppError(404, "Vendor not found.", {
      code: "VENDOR_NOT_FOUND",
    });
  }

  return vendor;
}

//************************************************************** */

export async function listVendors(
  organizationId: string,
  query: ListVendorsQueryInput,
) {
  return findVendorsByOrganization(organizationId, query);
}

//************************************************************** */

export async function updateVendor(
  organizationId: string,
  vendorId: string,
  input: UpdateVendorInput,
) {
  const existingVendor = await findVendorById(organizationId, vendorId);

  if (!existingVendor) {
    throw new AppError(404, "Vendor not found.", {
      code: "VENDOR_NOT_FOUND",
    });
  }

  if (input.name !== undefined && input.name !== existingVendor.name) {
    const duplicateVendor = await findVendorByName(organizationId, input.name);

    if (duplicateVendor) {
      throw new AppError(409, "A vendor with this name already exists.", {
        code: "VENDOR_NAME_TAKEN",
      });
    }
  }

  await updateVendorRecord(organizationId, vendorId, input);

  return getVendorById(organizationId, vendorId);
}

//************************************************************** */

export async function archiveVendor(organizationId: string, vendorId: string) {
  const existingVendor = await findVendorById(organizationId, vendorId);

  if (!existingVendor) {
    throw new AppError(404, "Vendor not found.", {
      code: "VENDOR_NOT_FOUND",
    });
  }

  if (!existingVendor.isActive) {
    throw new AppError(400, "Vendor is already archived.", {
      code: "VENDOR_ALREADY_ARCHIVED",
    });
  }

  await archiveVendorRecord(organizationId, vendorId);

  return getVendorById(organizationId, vendorId);
}

//************************************************************** */

export async function restoreVendor(organizationId: string, vendorId: string) {
  const existingVendor = await findVendorById(organizationId, vendorId);

  if (!existingVendor) {
    throw new AppError(404, "Vendor not found.", {
      code: "VENDOR_NOT_FOUND",
    });
  }

  if (existingVendor.isActive) {
    throw new AppError(400, "Vendor is already active.", {
      code: "VENDOR_ALREADY_ACTIVE",
    });
  }

  await restoreVendorRecord(organizationId, vendorId);

  return getVendorById(organizationId, vendorId);
}
