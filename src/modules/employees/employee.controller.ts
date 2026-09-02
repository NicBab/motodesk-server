import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import { created, ok } from "../../platform/http/api-response.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  listEmployees,
  restoreEmployee,
  updateEmployee,
} from "./employee.service.js";

import type {
  CreateEmployeeInput,
  EmployeeIdInput,
  ListEmployeesQueryInput,
  UpdateEmployeeInput,
} from "./employee.schemas.js";

//************************************************************** */

function requireOrganizationId(request: AuthenticatedRequest): string {
  const organizationId = request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(400, "A valid organization ID is required.", {
      code: "ORGANIZATION_ID_REQUIRED",
    });
  }

  return organizationId;
}

//************************************************************** */

export async function createEmployeeHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const input = requireValidatedBody<CreateEmployeeInput>(request);

  const employee = await createEmployee(organizationId, input);

  created(response, employee);
}

//************************************************************** */

export async function listEmployeesHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query = requireValidatedQuery<ListEmployeesQueryInput>(request);

  const employees = await listEmployees(organizationId, query);

  ok(response, employees);
}

//************************************************************** */

export async function getEmployeeHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { employeeId } = requireValidatedParams<EmployeeIdInput>(request);

  const employee = await getEmployeeById(organizationId, employeeId);

  ok(response, employee);
}

//************************************************************** */

export async function updateEmployeeHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { employeeId } = requireValidatedParams<EmployeeIdInput>(request);

  const input = requireValidatedBody<UpdateEmployeeInput>(request);

  const employee = await updateEmployee(organizationId, employeeId, input);

  ok(response, employee);
}

//************************************************************** */

export async function deactivateEmployeeHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { employeeId } = requireValidatedParams<EmployeeIdInput>(request);

  const employee = await deactivateEmployee(organizationId, employeeId);

  ok(response, employee);
}

//************************************************************** */

export async function restoreEmployeeHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { employeeId } = requireValidatedParams<EmployeeIdInput>(request);

  const employee = await restoreEmployee(organizationId, employeeId);

  ok(response, employee);
}

//************************************************************** */
