import { AppError } from "../../platform/errors/app-error.js";

import { verifyPassword } from "../auth/security/password.service.js";

import { findEmployeeById } from "../employees/employee.repository.js";

import {
  clockOutRecord,
  correctTimeEntryRecord,
  createClockInRecord,
  createManualTimeEntryRecord,
  findActiveTimeEntry,
  findCurrentlyClockedInEmployees,
  findEmployeeTimeEntries,
  findTimeClockEmployee,
  findTimeClockReportEmployees,
  findTimeClockReportEntries,
  type ManagerTimeContext,
} from "./time-clock.repository.js";

import type {
  CorrectTimeEntryInput,
  CreateManualTimeEntryInput,
  TimeClockReportQueryInput,
  TimeClockReportRange,
} from "./time-clock.schemas.js";

//************************************************************** */

export async function getEmployeeClockStatus(
  organizationId: string,
  employeeId: string,
) {
  const employee = await requireClockEmployee(organizationId, employeeId);

  const activeEntry = await findActiveTimeEntry(organizationId, employeeId);

  return {
    employee: {
      id: employee.id,

      firstName: employee.firstName,

      lastName: employee.lastName,

      role: employee.role,

      hasPin: Boolean(employee.pinHash),
    },

    clockedIn: Boolean(activeEntry),

    activeEntry,
  };
}

//************************************************************** */

export async function getCurrentlyClockedIn(organizationId: string) {
  return findCurrentlyClockedInEmployees(organizationId);
}

//************************************************************** */

export async function clockEmployeeIn(
  organizationId: string,
  employeeId: string,
  pin: string,
) {
  const employee = await requireClockEmployee(organizationId, employeeId);

  await verifyEmployeePin(employee.pinHash, pin);

  const result = await createClockInRecord(
    organizationId,
    employee.id,
    formatEmployeeName(employee),
    new Date(),
  );

  if ("alreadyClockedIn" in result && result.alreadyClockedIn) {
    throw new AppError(409, "Employee is already clocked in.", {
      code: "EMPLOYEE_ALREADY_CLOCKED_IN",
    });
  }

  if (!("entry" in result)) {
    throw new AppError(500, "MotoDesk could not clock the employee in.", {
      code: "TIME_CLOCK_IN_FAILED",
    });
  }

  return result.entry;
}

//************************************************************** */

export async function clockEmployeeOut(
  organizationId: string,
  employeeId: string,
  pin: string,
) {
  const employee = await requireClockEmployee(organizationId, employeeId);

  await verifyEmployeePin(employee.pinHash, pin);

  const result = await clockOutRecord(organizationId, employeeId, new Date());

  if ("noActiveEntry" in result && result.noActiveEntry) {
    throw new AppError(409, "No active clock-in was found for this employee.", {
      code: "EMPLOYEE_NOT_CLOCKED_IN",
    });
  }

  if (!("entry" in result)) {
    throw new AppError(500, "MotoDesk could not clock the employee out.", {
      code: "TIME_CLOCK_OUT_FAILED",
    });
  }

  return result.entry;
}

//************************************************************** */

export async function createManualTimeEntry(
  organizationId: string,
  input: CreateManualTimeEntryInput,
  manager: ManagerTimeContext,
) {
  const employee = await findEmployeeById(organizationId, input.employeeId);

  if (!employee) {
    throw new AppError(404, "Employee not found.", {
      code: "TIME_CLOCK_EMPLOYEE_NOT_FOUND",
    });
  }

  if (input.clockOutAt <= input.clockInAt) {
    throw new AppError(400, "Clock-out time must be after clock-in time.", {
      code: "TIME_CLOCK_RANGE_INVALID",
    });
  }

  const workedMinutes = calculateWorkedMinutes(
    input.clockInAt,
    input.clockOutAt,
    input.breakMinutes,
  );

  return createManualTimeEntryRecord(organizationId, {
    employeeId: employee.id,

    employeeName: formatEmployeeName(employee),

    clockInAt: input.clockInAt,

    clockOutAt: input.clockOutAt,

    breakMinutes: input.breakMinutes,

    workedMinutes,

    notes: input.notes ?? null,

    reason: input.reason,

    manager,
  });
}

//************************************************************** */

export async function correctTimeEntry(
  organizationId: string,
  timeEntryId: string,
  input: CorrectTimeEntryInput,
  manager: ManagerTimeContext,
) {
  if (
    input.clockInAt &&
    input.clockOutAt &&
    input.clockOutAt <= input.clockInAt
  ) {
    throw new AppError(400, "Clock-out time must be after clock-in time.", {
      code: "TIME_CLOCK_RANGE_INVALID",
    });
  }

  const result = await correctTimeEntryRecord(organizationId, timeEntryId, {
    ...(input.clockInAt !== undefined
      ? {
          clockInAt: input.clockInAt,
        }
      : {}),

    ...(input.clockOutAt !== undefined
      ? {
          clockOutAt: input.clockOutAt,
        }
      : {}),

    ...(input.breakMinutes !== undefined
      ? {
          breakMinutes: input.breakMinutes,
        }
      : {}),

    ...(input.notes !== undefined
      ? {
          notes: input.notes,
        }
      : {}),

    reason: input.reason,

    manager,
  });

  if ("notFound" in result && result.notFound) {
    throw new AppError(404, "Time entry not found.", {
      code: "TIME_ENTRY_NOT_FOUND",
    });
  }

  if (!("entry" in result)) {
    throw new AppError(500, "MotoDesk could not correct the time entry.", {
      code: "TIME_ENTRY_CORRECTION_FAILED",
    });
  }

  const entry = result.entry;

  if (entry.clockOutAt && entry.clockOutAt <= entry.clockInAt) {
    throw new AppError(400, "Clock-out time must be after clock-in time.", {
      code: "TIME_CLOCK_RANGE_INVALID",
    });
  }

  return entry;
}

//************************************************************** */

export async function getEmployeeTimeHistory(
  organizationId: string,
  employeeId: string,
) {
  const employee = await findEmployeeById(organizationId, employeeId);

  if (!employee) {
    throw new AppError(404, "Employee not found.", {
      code: "TIME_CLOCK_EMPLOYEE_NOT_FOUND",
    });
  }

  return findEmployeeTimeEntries(organizationId, employeeId);
}

//************************************************************** */

async function requireClockEmployee(
  organizationId: string,
  employeeId: string,
) {
  const employee = await findTimeClockEmployee(organizationId, employeeId);

  if (!employee) {
    throw new AppError(404, "Active employee not found.", {
      code: "TIME_CLOCK_EMPLOYEE_NOT_FOUND",
    });
  }

  return employee;
}

//************************************************************** */

async function verifyEmployeePin(
  pinHash: string | null,
  pin: string,
): Promise<void> {
  if (!pinHash) {
    throw new AppError(
      400,
      "No Time Clock PIN is configured for this employee.",
      {
        code: "TIME_CLOCK_PIN_NOT_CONFIGURED",
      },
    );
  }

  const matches = await verifyPassword(pin, pinHash);

  if (!matches) {
    throw new AppError(401, "Invalid Time Clock PIN.", {
      code: "TIME_CLOCK_PIN_INVALID",
    });
  }
}

//************************************************************** */

export async function getTimeClockReport(
  organizationId: string,
  query: TimeClockReportQueryInput,
) {
  const { startDate, endDate } = resolveReportRange(
    query.range,
    query.anchorDate,
    query.startDate,
    query.endDate,
  );

  if (endDate < startDate) {
    throw new AppError(
      400,
      "Report end date must be on or after the start date.",
      {
        code: "TIME_CLOCK_REPORT_RANGE_INVALID",
      },
    );
  }

  //************************************************************** */

  if (query.employeeId) {
    const employee = await findEmployeeById(organizationId, query.employeeId);

    if (!employee) {
      throw new AppError(404, "Employee not found.", {
        code: "TIME_CLOCK_EMPLOYEE_NOT_FOUND",
      });
    }
  }

  //************************************************************** */

  const [entries, employees] = await Promise.all([
    findTimeClockReportEntries(organizationId, {
      startDate,

      endDate,

      ...(query.employeeId
        ? {
            employeeId: query.employeeId,
          }
        : {}),

      includeInactive: query.includeInactive,
    }),

    findTimeClockReportEmployees(organizationId, query.includeInactive),
  ]);

  //************************************************************** */

  const workedMinutes = entries.reduce(
    (total, entry) =>
      total +
      (entry.workedMinutes ??
        calculateOpenShiftMinutes(entry.clockInAt, entry.breakMinutes)),
    0,
  );

  const breakMinutes = entries.reduce(
    (total, entry) => total + entry.breakMinutes,
    0,
  );

  const completedEntries = entries.filter(
    (entry) => entry.status === "CLOCKED_OUT",
  ).length;

  const activeEntries = entries.filter(
    (entry) => entry.status === "CLOCKED_IN" || entry.status === "ON_BREAK",
  ).length;

  const manualEntries = entries.filter(
    (entry) => entry.source === "MANAGER_ENTRY",
  ).length;

  const correctedEntries = entries.filter(
    (entry) => entry.corrections.length > 0,
  ).length;

  //************************************************************** */

  const employeeSummary = employees
    .map((employee) => {
      const employeeEntries = entries.filter(
        (entry) => entry.employeeId === employee.id,
      );

      const employeeWorkedMinutes = employeeEntries.reduce(
        (total, entry) =>
          total +
          (entry.workedMinutes ??
            calculateOpenShiftMinutes(entry.clockInAt, entry.breakMinutes)),
        0,
      );

      return {
        employeeId: employee.id,

        firstName: employee.firstName,

        lastName: employee.lastName,

        role: employee.role,

        status: employee.status,

        hourlyRate: employee.hourlyRate,

        entryCount: employeeEntries.length,

        workedMinutes: employeeWorkedMinutes,

        workedHours: minutesToHours(employeeWorkedMinutes),
      };
    })
    .filter((employee) =>
      query.employeeId ? employee.employeeId === query.employeeId : true,
    );

  //************************************************************** */

  return {
    range: query.range,

    startDate: startDate.toISOString(),

    endDate: endDate.toISOString(),

    employeeId: query.employeeId ?? null,

    includeInactive: query.includeInactive,

    summary: {
      employeeCount: employeeSummary.filter(
        (employee) => employee.entryCount > 0,
      ).length,

      entryCount: entries.length,

      completedEntries,

      activeEntries,

      manualEntries,

      correctedEntries,

      workedMinutes,

      workedHours: minutesToHours(workedMinutes),

      breakMinutes,

      breakHours: minutesToHours(breakMinutes),
    },

    employeeSummary,

    entries,
  };
}

//************************************************************** */

function resolveReportRange(
  range: TimeClockReportRange,
  anchorDateValue?: string,
  customStartValue?: string,
  customEndValue?: string,
): {
  startDate: Date;

  endDate: Date;
} {
  if (range === "CUSTOM") {
    if (!customStartValue || !customEndValue) {
      throw new AppError(400, "Custom reports require a start and end date.", {
        code: "TIME_CLOCK_CUSTOM_RANGE_REQUIRED",
      });
    }

    return {
      startDate: startOfDay(parseDate(customStartValue)),

      endDate: endOfDay(parseDate(customEndValue)),
    };
  }

  const anchorDate = anchorDateValue ? parseDate(anchorDateValue) : new Date();

  //************************************************************** */

  if (range === "DAILY") {
    return {
      startDate: startOfDay(anchorDate),

      endDate: endOfDay(anchorDate),
    };
  }

  //************************************************************** */

  if (range === "WEEKLY") {
    const startDate = startOfDay(anchorDate);

    /*
     * Sunday-based week.
     */
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const endDate = new Date(startDate);

    endDate.setDate(endDate.getDate() + 6);

    return {
      startDate,

      endDate: endOfDay(endDate),
    };
  }

  //************************************************************** */

  if (range === "MONTHLY") {
    const startDate = new Date(
      anchorDate.getFullYear(),
      anchorDate.getMonth(),
      1,
    );

    const endDate = new Date(
      anchorDate.getFullYear(),
      anchorDate.getMonth() + 1,
      0,
    );

    return {
      startDate: startOfDay(startDate),

      endDate: endOfDay(endDate),
    };
  }

  //************************************************************** */

  const startDate = new Date(anchorDate.getFullYear(), 0, 1);

  const endDate = new Date(anchorDate.getFullYear(), 11, 31);

  return {
    startDate: startOfDay(startDate),

    endDate: endOfDay(endDate),
  };
}

//************************************************************** */

function parseDate(value: string): Date {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "A report date is invalid.", {
      code: "TIME_CLOCK_REPORT_DATE_INVALID",
    });
  }

  return date;
}

//************************************************************** */

function startOfDay(value: Date): Date {
  const date = new Date(value);

  date.setHours(0, 0, 0, 0);

  return date;
}

//************************************************************** */

function endOfDay(value: Date): Date {
  const date = new Date(value);

  date.setHours(23, 59, 59, 999);

  return date;
}

//************************************************************** */

function calculateOpenShiftMinutes(
  clockInAt: Date,
  breakMinutes: number,
): number {
  return Math.max(
    Math.floor((Date.now() - clockInAt.getTime()) / 60000) - breakMinutes,
    0,
  );
}

//************************************************************** */

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

//************************************************************** */

//************************************************************** */

function formatEmployeeName(employee: {
  firstName: string;

  lastName: string;
}): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

//************************************************************** */

function calculateWorkedMinutes(
  clockInAt: Date,
  clockOutAt: Date,
  breakMinutes: number,
): number {
  return Math.max(
    Math.floor((clockOutAt.getTime() - clockInAt.getTime()) / 60000) -
      breakMinutes,
    0,
  );
}

//************************************************************** */
