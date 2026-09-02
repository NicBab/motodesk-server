import { EmployeeStatus } from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import type {
  CreateEmployeeInput,
  ListEmployeesQueryInput,
} from "./employee.schemas.js";

//************************************************************** */

export type EmployeeUpdateData = {
  firstName?: string;

  lastName?: string;

  role?: CreateEmployeeInput["role"];

  status?: CreateEmployeeInput["status"];

  phone?: string | null;

  email?: string | null;

  hourlyRate?: number;

  laborRate?: number;

  hireDate?: Date | null;

  pinHash?: string | null;

  membershipId?: string | null;

  isSchedulable?: boolean;

  dailyStartTime?: string;

  dailyEndTime?: string;

  maxDailyHours?: number;

  skills?: string | null;
};

//************************************************************** */

const employeeInclude = {
  membership: {
    include: {
      user: true,
    },
  },
} as const;

//************************************************************** */

export async function createEmployeeRecord(
  organizationId: string,
  input: CreateEmployeeInput,
  pinHash: string | null,
) {
  return prisma.employee.create({
    data: {
      organizationId,

      membershipId: input.membershipId ?? null,

      firstName: input.firstName,

      lastName: input.lastName,

      role: input.role,

      status: input.status,

      phone: input.phone ?? null,

      email: input.email ?? null,

      hourlyRate: input.hourlyRate,

      laborRate: input.laborRate,

      hireDate: input.hireDate ?? null,

      pinHash,

      isSchedulable: input.isSchedulable,

      dailyStartTime: input.dailyStartTime,

      dailyEndTime: input.dailyEndTime,

      maxDailyHours: input.maxDailyHours,

      skills: input.skills ?? null,
    },

    include: employeeInclude,
  });
}

//************************************************************** */

export async function findEmployeeById(
  organizationId: string,
  employeeId: string,
) {
  return prisma.employee.findFirst({
    where: {
      id: employeeId,

      organizationId,
    },

    include: employeeInclude,
  });
}

//************************************************************** */

export async function findEmployeeByMembershipId(
  organizationId: string,
  membershipId: string,
) {
  return prisma.employee.findFirst({
    where: {
      organizationId,

      membershipId,
    },

    include: employeeInclude,
  });
}

//************************************************************** */

export async function findEmployeesByOrganization(
  organizationId: string,
  query: ListEmployeesQueryInput,
) {
  return prisma.employee.findMany({
    where: {
      organizationId,

      ...(query.role
        ? {
            role: query.role,
          }
        : {}),

      ...(query.status
        ? {
            status: query.status,
          }
        : {}),

      ...(query.isSchedulable !== undefined
        ? {
            isSchedulable: query.isSchedulable,
          }
        : {}),

      ...(query.search
        ? {
            OR: [
              {
                firstName: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                lastName: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                email: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                phone: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },

              {
                skills: {
                  contains: query.search,

                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },

    include: employeeInclude,

    orderBy: [
      {
        status: "asc",
      },

      {
        lastName: "asc",
      },

      {
        firstName: "asc",
      },
    ],
  });
}

//************************************************************** */

export async function updateEmployeeRecord(
  organizationId: string,
  employeeId: string,
  data: EmployeeUpdateData,
) {
  return prisma.employee.updateMany({
    where: {
      id: employeeId,

      organizationId,
    },

    data,
  });
}

//************************************************************** */

export async function deactivateEmployeeRecord(
  organizationId: string,
  employeeId: string,
) {
  return prisma.employee.updateMany({
    where: {
      id: employeeId,

      organizationId,

      status: EmployeeStatus.ACTIVE,
    },

    data: {
      status: EmployeeStatus.INACTIVE,

      isSchedulable: false,
    },
  });
}

//************************************************************** */

export async function restoreEmployeeRecord(
  organizationId: string,
  employeeId: string,
) {
  return prisma.employee.updateMany({
    where: {
      id: employeeId,

      organizationId,

      status: EmployeeStatus.INACTIVE,
    },

    data: {
      status: EmployeeStatus.ACTIVE,
    },
  });
}

//************************************************************** */
