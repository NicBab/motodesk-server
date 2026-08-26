import { AppError } from "../../platform/errors/app-error.js";

import {
  archiveCustomerRecord,
  createCustomerRecord,
  findCustomerById,
  findCustomersByOrganization,
  restoreCustomerRecord,
  updateCustomerRecord,
} from "./customer.repository.js";

import type {
  CreateCustomerInput,
  ListCustomersQueryInput,
  UpdateCustomerInput,
} from "./customer.schemas.js";

//************************************************************** */

export async function createCustomer(
  organizationId: string,
  input: CreateCustomerInput,
) {
  return createCustomerRecord(organizationId, input);
}

//************************************************************** */

export async function getCustomerById(
  organizationId: string,
  customerId: string,
) {
  const customer = await findCustomerById(organizationId, customerId);

  if (!customer) {
    throw new AppError(404, "Customer not found.", {
      code: "CUSTOMER_NOT_FOUND",
    });
  }

  return customer;
}

//************************************************************** */

export async function listCustomers(
  organizationId: string,
  query: ListCustomersQueryInput,
) {
  const customers = await findCustomersByOrganization(organizationId, query);

  return customers.map(({ _count, ...customer }) => ({
    ...customer,
    vehicleCount: _count.vehicles,
  }));
}

//************************************************************** */

function assertCustomerIdentityValid(
  type: "INDIVIDUAL" | "BUSINESS",
  firstName: string | null,
  lastName: string | null,
  companyName: string | null,
): void {
  if (type === "INDIVIDUAL" && !firstName && !lastName) {
    throw new AppError(
      400,
      "An individual customer requires a first or last name.",
      {
        code: "CUSTOMER_NAME_REQUIRED",
      },
    );
  }

  if (type === "BUSINESS" && !companyName) {
    throw new AppError(400, "A business customer requires a company name.", {
      code: "CUSTOMER_COMPANY_NAME_REQUIRED",
    });
  }
}

//************************************************************** */

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  input: UpdateCustomerInput,
) {
  const existingCustomer = await findCustomerById(organizationId, customerId);

  if (!existingCustomer) {
    throw new AppError(404, "Customer not found.", {
      code: "CUSTOMER_NOT_FOUND",
    });
  }

  const nextType = input.type ?? existingCustomer.type;

  const nextFirstName = input.firstName ?? existingCustomer.firstName;

  const nextLastName = input.lastName ?? existingCustomer.lastName;

  const nextCompanyName = input.companyName ?? existingCustomer.companyName;

  assertCustomerIdentityValid(
    nextType,
    nextFirstName,
    nextLastName,
    nextCompanyName,
  );

  await updateCustomerRecord(organizationId, customerId, input);

  return getCustomerById(organizationId, customerId);
}

//************************************************************** */

export async function archiveCustomer(
  organizationId: string,
  customerId: string,
) {
  const existingCustomer = await findCustomerById(organizationId, customerId);

  if (!existingCustomer) {
    throw new AppError(404, "Customer not found.", {
      code: "CUSTOMER_NOT_FOUND",
    });
  }

  if (!existingCustomer.isActive) {
    throw new AppError(400, "Customer is already archived.", {
      code: "CUSTOMER_ALREADY_ARCHIVED",
    });
  }

  await archiveCustomerRecord(organizationId, customerId);

  return getCustomerById(organizationId, customerId);
}

//************************************************************** */

export async function restoreCustomer(
  organizationId: string,
  customerId: string,
) {
  const result = await restoreCustomerRecord(organizationId, customerId);

  if (result.count === 0) {
    throw new AppError(404, "Archived customer not found.", {
      code: "ARCHIVED_CUSTOMER_NOT_FOUND",
    });
  }

  return getCustomerById(organizationId, customerId);
}

//************************************************************** */
