import {
  EmployeeStatus,
  EmployeeTimeEntryAuthMethod,
  EmployeeTimeEntrySource,
  EmployeeTimeEntryStatus,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

//************************************************************** */

const timeEntryInclude = {
  employee: {
    select: {
      id: true,

      firstName: true,

      lastName: true,

      role: true,

      status: true,
    },
  },

  corrections: {
    orderBy: {
      changedAt: "desc" as const,
    },
  },
} as const;

//************************************************************** */

export type ManagerTimeContext = {
  membershipId: string | null;

  name: string | null;
};

//************************************************************** */

export type ManualTimeEntryRecordData = {
  employeeId: string;

  employeeName: string;

  clockInAt: Date;

  clockOutAt: Date;

  breakMinutes: number;

  workedMinutes: number;

  notes: string | null;

  reason: string;

  manager: ManagerTimeContext;
};

//************************************************************** */

export type TimeEntryCorrectionData = {
  clockInAt?: Date;

  clockOutAt?: Date | null;

  breakMinutes?: number;

  notes?: string | null;

  reason: string;

  manager: ManagerTimeContext;
};

//************************************************************** */

export async function findTimeClockEmployee(
  organizationId: string,
  employeeId: string,
) {
  return prisma.employee.findFirst({
    where: {
      id: employeeId,

      organizationId,

      status: EmployeeStatus.ACTIVE,
    },

    select: {
      id: true,

      organizationId: true,

      firstName: true,

      lastName: true,

      role: true,

      status: true,

      pinHash: true,
    },
  });
}

//************************************************************** */

export async function findActiveTimeEntry(
  organizationId: string,
  employeeId: string,
) {
  return prisma.employeeTimeEntry.findFirst({
    where: {
      organizationId,

      employeeId,

      status: {
        in: [
          EmployeeTimeEntryStatus.CLOCKED_IN,
          EmployeeTimeEntryStatus.ON_BREAK,
        ],
      },
    },

    include: timeEntryInclude,

    orderBy: {
      clockInAt: "desc",
    },
  });
}

//************************************************************** */

export async function findCurrentlyClockedInEmployees(organizationId: string) {
  return prisma.employeeTimeEntry.findMany({
    where: {
      organizationId,

      status: {
        in: [
          EmployeeTimeEntryStatus.CLOCKED_IN,
          EmployeeTimeEntryStatus.ON_BREAK,
        ],
      },
    },

    include: timeEntryInclude,

    orderBy: {
      clockInAt: "asc",
    },
  });
}

//************************************************************** */

export async function findTimeEntryById(
  organizationId: string,
  timeEntryId: string,
) {
  return prisma.employeeTimeEntry.findFirst({
    where: {
      id: timeEntryId,

      organizationId,
    },

    include: timeEntryInclude,
  });
}

//************************************************************** */

export async function createClockInRecord(
  organizationId: string,
  employeeId: string,
  employeeName: string,
  clockInAt: Date,
) {
  return prisma.$transaction(async (transaction) => {
    const activeEntry = await transaction.employeeTimeEntry.findFirst({
      where: {
        organizationId,

        employeeId,

        status: {
          in: [
            EmployeeTimeEntryStatus.CLOCKED_IN,
            EmployeeTimeEntryStatus.ON_BREAK,
          ],
        },
      },
    });

    if (activeEntry) {
      return {
        alreadyClockedIn: true as const,

        activeEntry,
      };
    }

    const entry = await transaction.employeeTimeEntry.create({
      data: {
        organizationId,

        employeeId,

        employeeName,

        clockInAt,

        status: EmployeeTimeEntryStatus.CLOCKED_IN,

        source: EmployeeTimeEntrySource.TIME_CLOCK_KIOSK,

        authMethod: EmployeeTimeEntryAuthMethod.PIN,
      },

      include: timeEntryInclude,
    });

    return {
      entry,
    };
  });
}

//************************************************************** */

export async function clockOutRecord(
  organizationId: string,
  employeeId: string,
  clockOutAt: Date,
) {
  return prisma.$transaction(async (transaction) => {
    const activeEntry = await transaction.employeeTimeEntry.findFirst({
      where: {
        organizationId,

        employeeId,

        status: {
          in: [
            EmployeeTimeEntryStatus.CLOCKED_IN,
            EmployeeTimeEntryStatus.ON_BREAK,
          ],
        },
      },
    });

    if (!activeEntry) {
      return {
        noActiveEntry: true as const,
      };
    }

    const workedMinutes = calculateWorkedMinutes(
      activeEntry.clockInAt,
      clockOutAt,
      activeEntry.breakMinutes,
    );

    const entry = await transaction.employeeTimeEntry.update({
      where: {
        id: activeEntry.id,
      },

      data: {
        clockOutAt,

        workedMinutes,

        status: EmployeeTimeEntryStatus.CLOCKED_OUT,
      },

      include: timeEntryInclude,
    });

    return {
      entry,
    };
  });
}

//************************************************************** */

export async function createManualTimeEntryRecord(
  organizationId: string,
  data: ManualTimeEntryRecordData,
) {
  return prisma.$transaction(async (transaction) => {
    const entry = await transaction.employeeTimeEntry.create({
      data: {
        organizationId,

        employeeId: data.employeeId,

        employeeName: data.employeeName,

        clockInAt: data.clockInAt,

        clockOutAt: data.clockOutAt,

        breakMinutes: data.breakMinutes,

        workedMinutes: data.workedMinutes,

        status: EmployeeTimeEntryStatus.CLOCKED_OUT,

        source: EmployeeTimeEntrySource.MANAGER_ENTRY,

        authMethod: EmployeeTimeEntryAuthMethod.MANUAL,

        notes: data.notes,
      },
    });

    await transaction.employeeTimeEntryCorrection.create({
      data: {
        timeEntryId: entry.id,

        field: "MANUAL_ENTRY",

        originalValue: null,

        updatedValue: `${data.clockInAt.toISOString()} → ${data.clockOutAt.toISOString()}`,

        reason: data.reason,

        managerMembershipId: data.manager.membershipId,

        managerName: data.manager.name,
      },
    });

    return transaction.employeeTimeEntry.findUniqueOrThrow({
      where: {
        id: entry.id,
      },

      include: timeEntryInclude,
    });
  });
}

//************************************************************** */

export async function correctTimeEntryRecord(
  organizationId: string,
  timeEntryId: string,
  data: TimeEntryCorrectionData,
) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.employeeTimeEntry.findFirst({
      where: {
        id: timeEntryId,

        organizationId,
      },
    });

    if (!existing) {
      return {
        notFound: true as const,
      };
    }

    const nextClockIn = data.clockInAt ?? existing.clockInAt;

    const nextClockOut =
      data.clockOutAt !== undefined ? data.clockOutAt : existing.clockOutAt;

    const nextBreakMinutes = data.breakMinutes ?? existing.breakMinutes;

    const nextNotes = data.notes !== undefined ? data.notes : existing.notes;

    const corrections: Array<{
      field: string;

      originalValue: string | null;

      updatedValue: string | null;
    }> = [];

    if (
      data.clockInAt !== undefined &&
      data.clockInAt.getTime() !== existing.clockInAt.getTime()
    ) {
      corrections.push({
        field: "clockInAt",

        originalValue: existing.clockInAt.toISOString(),

        updatedValue: data.clockInAt.toISOString(),
      });
    }

    if (data.clockOutAt !== undefined) {
      const oldValue = existing.clockOutAt?.toISOString() ?? null;

      const newValue = data.clockOutAt?.toISOString() ?? null;

      if (oldValue !== newValue) {
        corrections.push({
          field: "clockOutAt",

          originalValue: oldValue,

          updatedValue: newValue,
        });
      }
    }

    if (
      data.breakMinutes !== undefined &&
      data.breakMinutes !== existing.breakMinutes
    ) {
      corrections.push({
        field: "breakMinutes",

        originalValue: String(existing.breakMinutes),

        updatedValue: String(data.breakMinutes),
      });
    }

    if (data.notes !== undefined && data.notes !== existing.notes) {
      corrections.push({
        field: "notes",

        originalValue: existing.notes,

        updatedValue: data.notes,
      });
    }

    const workedMinutes = nextClockOut
      ? calculateWorkedMinutes(nextClockIn, nextClockOut, nextBreakMinutes)
      : null;

    const status = nextClockOut
      ? EmployeeTimeEntryStatus.CLOCKED_OUT
      : EmployeeTimeEntryStatus.CLOCKED_IN;

    await transaction.employeeTimeEntry.update({
      where: {
        id: existing.id,
      },

      data: {
        clockInAt: nextClockIn,

        clockOutAt: nextClockOut,

        breakMinutes: nextBreakMinutes,

        workedMinutes,

        notes: nextNotes,

        status,
      },
    });

    if (corrections.length > 0) {
      await transaction.employeeTimeEntryCorrection.createMany({
        data: corrections.map((correction) => ({
          timeEntryId: existing.id,

          field: correction.field,

          originalValue: correction.originalValue,

          updatedValue: correction.updatedValue,

          reason: data.reason,

          managerMembershipId: data.manager.membershipId,

          managerName: data.manager.name,
        })),
      });
    }

    const entry = await transaction.employeeTimeEntry.findUniqueOrThrow({
      where: {
        id: existing.id,
      },

      include: timeEntryInclude,
    });

    return {
      entry,
    };
  });
}

//************************************************************** */

export async function findEmployeeTimeEntries(
  organizationId: string,
  employeeId: string,
) {
  return prisma.employeeTimeEntry.findMany({
    where: {
      organizationId,

      employeeId,
    },

    include: timeEntryInclude,

    orderBy: {
      clockInAt: "desc",
    },
  });
}

//************************************************************** */

export type TimeClockReportFilters = {
  startDate: Date;

  endDate: Date;

  employeeId?: string;

  includeInactive: boolean;
};

//************************************************************** */

export async function findTimeClockReportEntries(
  organizationId: string,
  filters: TimeClockReportFilters,
) {
  return prisma.employeeTimeEntry.findMany({
    where: {
      organizationId,

      clockInAt: {
        gte: filters.startDate,

        lte: filters.endDate,
      },

      ...(filters.employeeId
        ? {
            employeeId: filters.employeeId,
          }
        : {}),

      ...(!filters.includeInactive
        ? {
            employee: {
              status: EmployeeStatus.ACTIVE,
            },
          }
        : {}),
    },

    include: timeEntryInclude,

    orderBy: [
      {
        clockInAt: "desc",
      },

      {
        employeeName: "asc",
      },
    ],
  });
}

//************************************************************** */

export async function findTimeClockReportEmployees(
  organizationId: string,
  includeInactive: boolean,
) {
  return prisma.employee.findMany({
    where: {
      organizationId,

      ...(!includeInactive
        ? {
            status: EmployeeStatus.ACTIVE,
          }
        : {}),
    },

    select: {
      id: true,

      firstName: true,

      lastName: true,

      role: true,

      status: true,

      hourlyRate: true,

      isSchedulable: true,
    },

    orderBy: [
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
