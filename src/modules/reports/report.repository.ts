import { prisma } from "../../config/prisma.js";

//************************************************************** */
// Repair Orders

export async function findReportRepairOrders(
  organizationId: string,
  start: Date,
  end: Date,
) {
  return prisma.repairOrder.findMany({
    where: {
      organizationId,

      createdAt: {
        gte: start,

        lt: end,
      },
    },

    include: {
      customer: true,

      vehicle: true,

      serviceAdvisor: {
        include: {
          user: true,
        },
      },

      primaryTechnician: {
        include: {
          user: true,
        },
      },

      laborLines: true,

      partLines: true,
    },

    orderBy: {
      createdAt: "desc",
    },
  });
}

//************************************************************** */
// POS / RO / Refund Sales

export async function findReportSales(
  organizationId: string,
  start: Date,
  end: Date,
) {
  return prisma.sale.findMany({
    where: {
      organizationId,

      createdAt: {
        gte: start,

        lt: end,
      },
    },

    include: {
      lines: true,
    },

    orderBy: {
      createdAt: "desc",
    },
  });
}

//************************************************************** */
// Employee Time Entries
//
// Employee.membershipId is a real production field and gives us
// the direct Employee -> Membership link needed for technician
// reporting without inventing another relation shape.

export async function findReportTimeEntries(
  organizationId: string,
  start: Date,
  end: Date,
) {
  return prisma.employeeTimeEntry.findMany({
    where: {
      organizationId,

      clockInAt: {
        gte: start,

        lt: end,
      },
    },

    include: {
      employee: {
        select: {
          id: true,

          membershipId: true,

          firstName: true,

          lastName: true,

          role: true,

          status: true,
        },
      },
    },

    orderBy: {
      clockInAt: "asc",
    },
  });
}

//************************************************************** */
// Cashiered ROs
//
// These use the cashier event date, not RO creation date.

export async function findReportCashieredRepairOrders(
  organizationId: string,
  start: Date,
  end: Date,
) {
  return prisma.repairOrder.findMany({
    where: {
      organizationId,

      cashierStatus: "COMPLETED",

      cashieredDate: {
        gte: start,

        lt: end,
      },
    },

    include: {
      customer: true,

      vehicle: true,

      laborLines: true,

      partLines: true,

      statusHistory: {
        where: {
          status: "CASHIERED",
        },

        include: {
          changedByMembership: {
            include: {
              user: true,
            },
          },
        },

        orderBy: {
          changedAt: "desc",
        },

        take: 1,
      },
    },

    orderBy: {
      cashieredDate: "desc",
    },
  });
}

//************************************************************** */
// Picked-Up ROs
//
// These use the pickup event date, not RO creation date.

export async function findReportPickedUpRepairOrders(
  organizationId: string,
  start: Date,
  end: Date,
) {
  return prisma.repairOrder.findMany({
    where: {
      organizationId,

      pickupStatus: "COMPLETED",

      pickupDate: {
        gte: start,

        lt: end,
      },
    },

    include: {
      customer: true,

      vehicle: true,

      statusHistory: {
        where: {
          status: "PICKED_UP",
        },

        include: {
          changedByMembership: {
            include: {
              user: true,
            },
          },
        },

        orderBy: {
          changedAt: "desc",
        },

        take: 1,
      },
    },

    orderBy: {
      pickupDate: "desc",
    },
  });
}

//************************************************************** */
// Reporting Years

export async function findReportYearSources(organizationId: string) {
  const [repairOrders, sales, timeEntries] = await Promise.all([
    prisma.repairOrder.findMany({
      where: {
        organizationId,
      },

      select: {
        createdAt: true,

        cashieredDate: true,

        pickupDate: true,
      },
    }),

    prisma.sale.findMany({
      where: {
        organizationId,
      },

      select: {
        createdAt: true,
      },
    }),

    prisma.employeeTimeEntry.findMany({
      where: {
        organizationId,
      },

      select: {
        clockInAt: true,
      },
    }),
  ]);

  return {
    repairOrders,

    sales,

    timeEntries,
  };
}

//************************************************************** */
