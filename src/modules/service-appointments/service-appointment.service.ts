import {
  AppError,
} from "../../platform/errors/app-error.js";

import {
  findCustomerById,
} from "../customers/customer.repository.js";

import {
  findEmployeeById,
} from "../employees/employee.repository.js";

import {
  findVehicleById,
} from "../vehicles/vehicle.repository.js";

import {
  cancelServiceAppointmentRecord,
  checkInServiceAppointmentRecord,
  confirmServiceAppointmentRecord,
  convertServiceAppointmentToRepairOrderRecord,
  createServiceAppointmentRecord,
  findServiceAppointmentById,
  findServiceAppointmentsByOrganization,
} from "./service-appointment.repository.js";

import type {
  CancelServiceAppointmentInput,
  CreateServiceAppointmentInput,
  ListServiceAppointmentsQueryInput,
} from "./service-appointment.schemas.js";

//************************************************************** */

function getCustomerDisplayName(
  customer: {
    firstName:
      | string
      | null;

    lastName:
      | string
      | null;

    companyName:
      | string
      | null;
  },
): string {
  if (
    customer.companyName
  ) {
    return customer.companyName;
  }

  const individualName =
    [
      customer.firstName,
      customer.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  return individualName ||
    "Customer";
}

//************************************************************** */

async function validateCustomerAndVehicle(
  organizationId: string,
  customerId:
    | string
    | undefined,
  vehicleId:
    | string
    | undefined,
) {
  const customer =
    customerId
      ? await findCustomerById(
          organizationId,
          customerId,
        )
      : null;

  if (
    customerId &&
    !customer
  ) {
    throw new AppError(
      400,
      "The selected customer does not belong to this organization.",
      {
        code:
          "SERVICE_APPOINTMENT_CUSTOMER_INVALID",
      },
    );
  }

  if (
    customer &&
    !customer.isActive
  ) {
    throw new AppError(
      400,
      "The selected customer is archived.",
      {
        code:
          "SERVICE_APPOINTMENT_CUSTOMER_ARCHIVED",
      },
    );
  }

  const vehicle =
    vehicleId
      ? await findVehicleById(
          organizationId,
          vehicleId,
        )
      : null;

  if (
    vehicleId &&
    !vehicle
  ) {
    throw new AppError(
      400,
      "The selected vehicle does not belong to this organization.",
      {
        code:
          "SERVICE_APPOINTMENT_VEHICLE_INVALID",
      },
    );
  }

  if (
    vehicle &&
    !vehicle.isActive
  ) {
    throw new AppError(
      400,
      "The selected vehicle is archived.",
      {
        code:
          "SERVICE_APPOINTMENT_VEHICLE_ARCHIVED",
      },
    );
  }

  if (
    customer &&
    vehicle &&
    vehicle.customerId !==
      null &&
    vehicle.customerId !==
      customer.id
  ) {
    throw new AppError(
      400,
      "The selected vehicle belongs to a different customer.",
      {
        code:
          "SERVICE_APPOINTMENT_CUSTOMER_VEHICLE_MISMATCH",
      },
    );
  }

  return {
    customer,
    vehicle,
  };
}

//************************************************************** */

async function validatePreferredTechnician(
  organizationId: string,
  employeeId:
    | string
    | undefined,
): Promise<void> {
  if (
    !employeeId
  ) {
    return;
  }

  const employee =
    await findEmployeeById(
      organizationId,
      employeeId,
    );

  if (
    !employee ||
    employee.status !==
      "ACTIVE" ||
    employee.role !==
      "TECHNICIAN"
  ) {
    throw new AppError(
      400,
      "The selected preferred technician is invalid.",
      {
        code:
          "SERVICE_APPOINTMENT_TECHNICIAN_INVALID",
      },
    );
  }
}

//************************************************************** */

async function validateServiceAdvisor(
  organizationId: string,
  employeeId:
    | string
    | undefined,
): Promise<void> {
  if (
    !employeeId
  ) {
    return;
  }

  const employee =
    await findEmployeeById(
      organizationId,
      employeeId,
    );

  if (
    !employee ||
    employee.status !==
      "ACTIVE" ||
    ![
      "SERVICE_ADVISOR",
      "SHOP_MANAGER",
    ].includes(
      employee.role,
    )
  ) {
    throw new AppError(
      400,
      "The selected service advisor is invalid.",
      {
        code:
          "SERVICE_APPOINTMENT_ADVISOR_INVALID",
      },
    );
  }
}

//************************************************************** */

export async function createServiceAppointment(
  organizationId: string,
  input: CreateServiceAppointmentInput,
) {
  const {
    customer,
  } =
    await validateCustomerAndVehicle(
      organizationId,
      input.customerId,
      input.vehicleId,
    );

  await Promise.all([
    validatePreferredTechnician(
      organizationId,
      input.preferredTechnicianEmployeeId,
    ),

    validateServiceAdvisor(
      organizationId,
      input.serviceAdvisorEmployeeId,
    ),
  ]);

  const customerName =
    customer
      ? getCustomerDisplayName(
          customer,
        )
      : "Walk-in";

  return createServiceAppointmentRecord(
    organizationId,
    customerName,
    input,
  );
}

//************************************************************** */

export async function getServiceAppointmentById(
  organizationId: string,
  appointmentId: string,
) {
  const appointment =
    await findServiceAppointmentById(
      organizationId,
      appointmentId,
    );

  if (
    !appointment
  ) {
    throw new AppError(
      404,
      "Service appointment not found.",
      {
        code:
          "SERVICE_APPOINTMENT_NOT_FOUND",
      },
    );
  }

  return appointment;
}

//************************************************************** */

export async function listServiceAppointments(
  organizationId: string,
  query: ListServiceAppointmentsQueryInput,
) {
  return findServiceAppointmentsByOrganization(
    organizationId,
    query,
  );
}

//************************************************************** */

export async function confirmServiceAppointment(
  organizationId: string,
  appointmentId: string,
) {
  const appointment =
    await getServiceAppointmentById(
      organizationId,
      appointmentId,
    );

  if (
    appointment.status !==
    "REQUESTED"
  ) {
    throw new AppError(
      400,
      "Only requested appointments can be confirmed.",
      {
        code:
          "SERVICE_APPOINTMENT_CONFIRM_INVALID_STATUS",
      },
    );
  }

  const confirmed =
    await confirmServiceAppointmentRecord(
      organizationId,
      appointmentId,
    );

  if (
    !confirmed
  ) {
    throw new AppError(
      409,
      "Appointment status changed before it could be confirmed.",
      {
        code:
          "SERVICE_APPOINTMENT_CONFIRM_CONFLICT",
      },
    );
  }

  return confirmed;
}

//************************************************************** */

export async function checkInServiceAppointment(
  organizationId: string,
  appointmentId: string,
) {
  const appointment =
    await getServiceAppointmentById(
      organizationId,
      appointmentId,
    );

  if (
    appointment.status !==
    "CONFIRMED"
  ) {
    throw new AppError(
      400,
      "Only confirmed appointments can be checked in.",
      {
        code:
          "SERVICE_APPOINTMENT_CHECK_IN_INVALID_STATUS",
      },
    );
  }

  const checkedIn =
    await checkInServiceAppointmentRecord(
      organizationId,
      appointmentId,
    );

  if (
    !checkedIn
  ) {
    throw new AppError(
      409,
      "Appointment status changed before it could be checked in.",
      {
        code:
          "SERVICE_APPOINTMENT_CHECK_IN_CONFLICT",
      },
    );
  }

  return checkedIn;
}

//************************************************************** */

export async function cancelServiceAppointment(
  organizationId: string,
  appointmentId: string,
  input: CancelServiceAppointmentInput,
) {
  const appointment =
    await getServiceAppointmentById(
      organizationId,
      appointmentId,
    );

  if (
    [
      "CANCELLED",
      "CONVERTED_TO_RO",
      "COMPLETED",
    ].includes(
      appointment.status,
    )
  ) {
    throw new AppError(
      400,
      "This appointment can no longer be cancelled.",
      {
        code:
          "SERVICE_APPOINTMENT_CANCEL_INVALID_STATUS",
      },
    );
  }

  const cancelled =
    await cancelServiceAppointmentRecord(
      organizationId,
      appointmentId,
      input.reason,
    );

  if (
    !cancelled
  ) {
    throw new AppError(
      409,
      "Appointment status changed before it could be cancelled.",
      {
        code:
          "SERVICE_APPOINTMENT_CANCEL_CONFLICT",
      },
    );
  }

  return cancelled;
}

//************************************************************** */

export async function convertServiceAppointmentToRepairOrder(
  organizationId: string,
  appointmentId: string,
  changedByMembershipId:
    | string
    | null,
) {
  const appointment =
    await getServiceAppointmentById(
      organizationId,
      appointmentId,
    );

  if (
    ![
      "CONFIRMED",
      "CHECKED_IN",
    ].includes(
      appointment.status,
    )
  ) {
    throw new AppError(
      400,
      "Only confirmed or checked-in appointments can be converted to a repair order.",
      {
        code:
          "SERVICE_APPOINTMENT_CONVERT_INVALID_STATUS",
      },
    );
  }

  if (
    appointment.repairOrderId
  ) {
    throw new AppError(
      400,
      "This appointment has already been converted to a repair order.",
      {
        code:
          "SERVICE_APPOINTMENT_ALREADY_CONVERTED",
      },
    );
  }

  if (
    !appointment.customerId ||
    !appointment.vehicleId
  ) {
    throw new AppError(
      400,
      "A customer and vehicle are required before an appointment can be converted to a repair order.",
      {
        code:
          "SERVICE_APPOINTMENT_CONVERT_CUSTOMER_VEHICLE_REQUIRED",
      },
    );
  }

  //************************************************************** */
  // Revalidate customer + vehicle immediately before conversion.

  await validateCustomerAndVehicle(
    organizationId,
    appointment.customerId,
    appointment.vehicleId,
  );

  //************************************************************** */
  // Base44 appointment advisor IDs refer to employees.
  //
  // MotoDesk RepairOrder uses memberships. Carry the advisor over
  // only when the selected employee is actually linked to one.

  const serviceAdvisorMembershipId =
    appointment.serviceAdvisor
      ?.membershipId ??
    null;

  const result =
    await convertServiceAppointmentToRepairOrderRecord(
      organizationId,
      appointmentId,
      changedByMembershipId,
      serviceAdvisorMembershipId,
    );

  if (
    !result
  ) {
    throw new AppError(
      409,
      "Appointment could not be converted because its state changed.",
      {
        code:
          "SERVICE_APPOINTMENT_CONVERT_CONFLICT",
      },
    );
  }

  return result;
}

//************************************************************** */