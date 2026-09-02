import { AppError } from "../../platform/errors/app-error.js";

import { hashPassword } from "../auth/security/password.service.js";

import { findMembershipById } from "../memberships/membership.repository.js";

import {
  createEmployeeRecord,
  deactivateEmployeeRecord,
  findEmployeeById,
  findEmployeeByMembershipId,
  findEmployeesByOrganization,
  restoreEmployeeRecord,
  updateEmployeeRecord,
  type EmployeeUpdateData,
} from "./employee.repository.js";

import type {
  CreateEmployeeInput,
  ListEmployeesQueryInput,
  UpdateEmployeeInput,
} from "./employee.schemas.js";

//************************************************************** */

export async function createEmployee(
  organizationId: string,
  input: CreateEmployeeInput,
) {
  if (input.membershipId) {
    await assertMembershipAvailable(organizationId, input.membershipId);
  }

  const pinHash = input.pin ? await hashPassword(input.pin) : null;

  const employee = await createEmployeeRecord(organizationId, input, pinHash);

  return toEmployeeRecord(employee);
}

//************************************************************** */

export async function getEmployeeById(
  organizationId: string,
  employeeId: string,
) {
  const employee = await findEmployeeById(organizationId, employeeId);

  if (!employee) {
    throw new AppError(404, "Employee not found.", {
      code: "EMPLOYEE_NOT_FOUND",
    });
  }

  return toEmployeeRecord(employee);
}

//************************************************************** */

export async function listEmployees(
  organizationId: string,
  query: ListEmployeesQueryInput,
) {
  const employees = await findEmployeesByOrganization(organizationId, query);

  return employees.map(toEmployeeRecord);
}

//************************************************************** */

export async function updateEmployee(
  organizationId: string,
  employeeId: string,
  input: UpdateEmployeeInput,
) {
  const existingEmployee = await findEmployeeById(organizationId, employeeId);

  if (!existingEmployee) {
    throw new AppError(404, "Employee not found.", {
      code: "EMPLOYEE_NOT_FOUND",
    });
  }

  //************************************************************** */

  if (
    input.membershipId !== undefined &&
    input.membershipId !== null &&
    input.membershipId !== existingEmployee.membershipId
  ) {
    await assertMembershipAvailable(
      organizationId,
      input.membershipId,
      employeeId,
    );
  }

  //************************************************************** */

  const data: EmployeeUpdateData = {
    ...(input.firstName !== undefined
      ? {
          firstName: input.firstName,
        }
      : {}),

    ...(input.lastName !== undefined
      ? {
          lastName: input.lastName,
        }
      : {}),

    ...(input.role !== undefined
      ? {
          role: input.role,
        }
      : {}),

    ...(input.status !== undefined
      ? {
          status: input.status,
        }
      : {}),

    ...(input.phone !== undefined
      ? {
          phone: input.phone ?? null,
        }
      : {}),

    ...(input.email !== undefined
      ? {
          email: input.email ?? null,
        }
      : {}),

    ...(input.hourlyRate !== undefined
      ? {
          hourlyRate: input.hourlyRate,
        }
      : {}),

    ...(input.laborRate !== undefined
      ? {
          laborRate: input.laborRate,
        }
      : {}),

    ...(input.hireDate !== undefined
      ? {
          hireDate: input.hireDate,
        }
      : {}),

    ...(input.membershipId !== undefined
      ? {
          membershipId: input.membershipId,
        }
      : {}),

    ...(input.isSchedulable !== undefined
      ? {
          isSchedulable: input.isSchedulable,
        }
      : {}),

    ...(input.dailyStartTime !== undefined
      ? {
          dailyStartTime: input.dailyStartTime,
        }
      : {}),

    ...(input.dailyEndTime !== undefined
      ? {
          dailyEndTime: input.dailyEndTime,
        }
      : {}),

    ...(input.maxDailyHours !== undefined
      ? {
          maxDailyHours: input.maxDailyHours,
        }
      : {}),

    ...(input.skills !== undefined
      ? {
          skills: input.skills ?? null,
        }
      : {}),
  };

  //************************************************************** */

  if (input.pin !== undefined) {
    data.pinHash = input.pin === null ? null : await hashPassword(input.pin);
  }

  await updateEmployeeRecord(organizationId, employeeId, data);

  return getEmployeeById(organizationId, employeeId);
}

//************************************************************** */

export async function deactivateEmployee(
  organizationId: string,
  employeeId: string,
) {
  const employee = await findEmployeeById(organizationId, employeeId);

  if (!employee) {
    throw new AppError(404, "Employee not found.", {
      code: "EMPLOYEE_NOT_FOUND",
    });
  }

  if (employee.status === "INACTIVE") {
    throw new AppError(400, "Employee is already inactive.", {
      code: "EMPLOYEE_ALREADY_INACTIVE",
    });
  }

  await deactivateEmployeeRecord(organizationId, employeeId);

  return getEmployeeById(organizationId, employeeId);
}

//************************************************************** */

export async function restoreEmployee(
  organizationId: string,
  employeeId: string,
) {
  const employee = await findEmployeeById(organizationId, employeeId);

  if (!employee) {
    throw new AppError(404, "Employee not found.", {
      code: "EMPLOYEE_NOT_FOUND",
    });
  }

  if (employee.status === "ACTIVE") {
    throw new AppError(400, "Employee is already active.", {
      code: "EMPLOYEE_ALREADY_ACTIVE",
    });
  }

  await restoreEmployeeRecord(organizationId, employeeId);

  return getEmployeeById(organizationId, employeeId);
}

//************************************************************** */

async function assertMembershipAvailable(
  organizationId: string,
  membershipId: string,
  currentEmployeeId?: string,
): Promise<void> {
  const membership = await findMembershipById(organizationId, membershipId);

  if (!membership) {
    throw new AppError(
      400,
      "The selected MotoDesk user does not belong to this organization.",
      {
        code: "EMPLOYEE_MEMBERSHIP_INVALID",
      },
    );
  }

  const linkedEmployee = await findEmployeeByMembershipId(
    organizationId,
    membershipId,
  );

  if (linkedEmployee && linkedEmployee.id !== currentEmployeeId) {
    throw new AppError(
      409,
      "This MotoDesk user is already linked to another employee.",
      {
        code: "EMPLOYEE_MEMBERSHIP_TAKEN",
      },
    );
  }
}

//************************************************************** */

function toEmployeeRecord<
  T extends {
    pinHash: string | null;
  },
>(employee: T) {
  const { pinHash, ...record } = employee;

  return {
    ...record,

    hasPin: Boolean(pinHash),
  };
}

//************************************************************** */
