import { AppError } from "../../platform/errors/app-error.js";

import {
  archiveVehicleRecord,
  createVehicleRecord,
  findVehicleById,
  findVehiclesByOrganization,
  updateVehicleRecord,
  restoreVehicleRecord,
} from "./vehicle.repository.js";

import type {
  CreateVehicleInput,
  ListVehiclesQueryInput,
  UpdateVehicleInput,
} from "./vehicle.schemas.js";

//************************************************************** */

async function assertCustomerBelongsToOrganization(
  organizationId: string,
  customerId: string,
): Promise<void> {
  const customer = await import("../customers/customer.repository.js").then(
    ({ findCustomerById }) => findCustomerById(organizationId, customerId),
  );

  if (!customer) {
    throw new AppError(
      400,
      "The selected customer does not belong to this organization.",
      {
        code: "VEHICLE_CUSTOMER_INVALID",
      },
    );
  }

  if (!customer.isActive) {
    throw new AppError(400, "The selected customer is archived.", {
      code: "VEHICLE_CUSTOMER_ARCHIVED",
    });
  }
}

//************************************************************** */

export async function createVehicle(
  organizationId: string,
  input: CreateVehicleInput,
) {
  if (input.customerId) {
    await assertCustomerBelongsToOrganization(organizationId, input.customerId);
  }

  return createVehicleRecord(organizationId, input);
}

//************************************************************** */

export async function getVehicleById(
  organizationId: string,
  vehicleId: string,
) {
  const vehicle = await findVehicleById(organizationId, vehicleId);

  if (!vehicle) {
    throw new AppError(404, "Vehicle not found.", {
      code: "VEHICLE_NOT_FOUND",
    });
  }

  return vehicle;
}

//************************************************************** */

export async function listVehicles(
  organizationId: string,
  query: ListVehiclesQueryInput,
) {
  return findVehiclesByOrganization(organizationId, query);
}

//************************************************************** */

export async function updateVehicle(
  organizationId: string,
  vehicleId: string,
  input: UpdateVehicleInput,
) {
  const existingVehicle = await findVehicleById(organizationId, vehicleId);

  if (!existingVehicle) {
    throw new AppError(404, "Vehicle not found.", {
      code: "VEHICLE_NOT_FOUND",
    });
  }

  if (input.customerId) {
    await assertCustomerBelongsToOrganization(organizationId, input.customerId);
  }

  await updateVehicleRecord(organizationId, vehicleId, input);

  return getVehicleById(organizationId, vehicleId);
}

//************************************************************** */

export async function archiveVehicle(
  organizationId: string,
  vehicleId: string,
) {
  const existingVehicle = await findVehicleById(organizationId, vehicleId);

  if (!existingVehicle) {
    throw new AppError(404, "Vehicle not found.", {
      code: "VEHICLE_NOT_FOUND",
    });
  }

  if (!existingVehicle.isActive) {
    throw new AppError(400, "Vehicle is already archived.", {
      code: "VEHICLE_ALREADY_ARCHIVED",
    });
  }

  await archiveVehicleRecord(organizationId, vehicleId);

  return getVehicleById(organizationId, vehicleId);
}

//************************************************************** */

export async function restoreVehicle(
  organizationId: string,
  vehicleId: string,
) {
  const result = await restoreVehicleRecord(organizationId, vehicleId);

  if (result.count === 0) {
    throw new AppError(404, "Archived vehicle not found.");
  }

  return getVehicleById(organizationId, vehicleId);
}

//************************************************************** */
