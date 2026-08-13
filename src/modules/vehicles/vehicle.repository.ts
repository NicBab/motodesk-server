import {
  prisma,
} from "../../config/prisma.js";

import type {
  CreateVehicleInput,
  ListVehiclesQueryInput,
  UpdateVehicleInput,
} from "./vehicle.schemas.js";

//************************************************************** */

export async function createVehicleRecord(
  organizationId: string,
  input: CreateVehicleInput,
) {
  return prisma.vehicle.create({
    data: {
      organizationId,

      customerId:
        input.customerId ?? null,

      year:
        input.year ?? null,

      make:
        input.make,

      model:
        input.model,

      trim:
        input.trim ?? null,

      vin:
        input.vin ?? null,

      mileage:
        input.mileage ?? null,

      color:
        input.color ?? null,

      licensePlate:
        input.licensePlate ?? null,

      type:
        input.type ?? null,

      classification:
        input.classification,

      inventoryStatus:
        input.inventoryStatus,

      stockNumber:
        input.stockNumber ?? null,

      listPrice:
        input.listPrice ?? null,

      unitCost:
        input.unitCost ?? null,

      salesperson:
        input.salesperson ?? null,

      notes:
        input.notes ?? null,
    },
  });
}

//************************************************************** */

export async function findVehicleById(
  organizationId: string,
  vehicleId: string,
) {
  return prisma.vehicle.findFirst({
    where: {
      id: vehicleId,
      organizationId,
    },
  });
}

//************************************************************** */

export async function findVehiclesByOrganization(
  organizationId: string,
  query: ListVehiclesQueryInput,
) {
  return prisma.vehicle.findMany({
    where: {
      organizationId,

      ...(query.customerId !== undefined
        ? {
            customerId:
              query.customerId,
          }
        : {}),

      ...(query.type !== undefined
        ? {
            type:
              query.type,
          }
        : {}),

      ...(query.classification !== undefined
        ? {
            classification:
              query.classification,
          }
        : {}),

      ...(query.inventoryStatus !== undefined
        ? {
            inventoryStatus:
              query.inventoryStatus,
          }
        : {}),

      ...(query.isActive !== undefined
        ? {
            isActive:
              query.isActive,
          }
        : {}),

      ...(query.search !== undefined
        ? {
            OR: [
              {
                make: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
              {
                model: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
              {
                trim: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
              {
                vin: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
              {
                stockNumber: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
              {
                licensePlate: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },
            ],
          }
        : {}),
    },

    orderBy: [
      {
        year: "desc",
      },
      {
        make: "asc",
      },
      {
        model: "asc",
      },
    ],
  });
}

//************************************************************** */

export async function updateVehicleRecord(
  organizationId: string,
  vehicleId: string,
  input: UpdateVehicleInput,
) {
  return prisma.vehicle.updateMany({
    where: {
      id: vehicleId,
      organizationId,
    },

    data: {
      ...(input.customerId !== undefined
        ? {
            customerId:
              input.customerId,
          }
        : {}),

      ...(input.year !== undefined
        ? {
            year:
              input.year,
          }
        : {}),

      ...(input.make !== undefined
        ? {
            make:
              input.make,
          }
        : {}),

      ...(input.model !== undefined
        ? {
            model:
              input.model,
          }
        : {}),

      ...(input.trim !== undefined
        ? {
            trim:
              input.trim,
          }
        : {}),

      ...(input.vin !== undefined
        ? {
            vin:
              input.vin,
          }
        : {}),

      ...(input.mileage !== undefined
        ? {
            mileage:
              input.mileage,
          }
        : {}),

      ...(input.color !== undefined
        ? {
            color:
              input.color,
          }
        : {}),

      ...(input.licensePlate !== undefined
        ? {
            licensePlate:
              input.licensePlate,
          }
        : {}),

      ...(input.type !== undefined
        ? {
            type:
              input.type,
          }
        : {}),

      ...(input.classification !== undefined
        ? {
            classification:
              input.classification,
          }
        : {}),

      ...(input.inventoryStatus !== undefined
        ? {
            inventoryStatus:
              input.inventoryStatus,
          }
        : {}),

      ...(input.stockNumber !== undefined
        ? {
            stockNumber:
              input.stockNumber,
          }
        : {}),

      ...(input.listPrice !== undefined
        ? {
            listPrice:
              input.listPrice,
          }
        : {}),

      ...(input.unitCost !== undefined
        ? {
            unitCost:
              input.unitCost,
          }
        : {}),

      ...(input.salesperson !== undefined
        ? {
            salesperson:
              input.salesperson,
          }
        : {}),

      ...(input.notes !== undefined
        ? {
            notes:
              input.notes,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function archiveVehicleRecord(
  organizationId: string,
  vehicleId: string,
) {
  return prisma.vehicle.updateMany({
    where: {
      id: vehicleId,
      organizationId,
      isActive: true,
    },

    data: {
      isActive: false,
    },
  });
}