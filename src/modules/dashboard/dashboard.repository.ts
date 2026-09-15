import { prisma } from "../../config/prisma.js";

//************************************************************** */

const CLOSED_REPAIR_ORDER_STATUSES = [
  "PICKED_UP",
  "CLOSED",
  "CANCELLED",
] as const;

//************************************************************** */

const ACTIVE_PURCHASE_ORDER_STATUSES = [
  "SUBMITTED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
] as const;

//************************************************************** */

export async function getDashboardRepositoryData(
  organizationId: string,
  monthStart: Date,
  monthEnd: Date,
  now: Date,
) {
  const [
    openRepairOrders,
    completedThisMonth,
    lowStockAlertCount,
    lowStockParts,
    awaitingApproval,
    waitingOnParts,
    readyToWork,
    readyForPickup,
    toBeOrdered,
    backordered,
    monthSales,
    recentRepairOrders,
    expectedDeliveries,
  ] = await Promise.all([
    //************************************************************** */
    // Open repair orders

    prisma.repairOrder.findMany({
      where: {
        organizationId,

        isActive: true,

        status: {
          notIn: [...CLOSED_REPAIR_ORDER_STATUSES],
        },
      },

      select: {
        id: true,
        vehicleId: true,
      },
    }),

    //************************************************************** */
    // Completed this month
    //
    // This intentionally uses the actual completed/cashier/pickup
    // lifecycle statuses and the RO update timestamp for the
    // dashboard operational count. We are not using this dataset
    // for financial reporting.

    prisma.repairOrder.count({
      where: {
        organizationId,

        isActive: true,

        status: {
          in: ["COMPLETED", "PICKED_UP", "CLOSED"],
        },

        updatedAt: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
    }),

    //************************************************************** */
    // Low-stock inventory count

    prisma.part.count({
      where: {
        organizationId,

        isActive: true,

        qtyOnHand: {
          lte: prisma.part.fields.reorderPoint,
        },
      },
    }),

    //************************************************************** */
    // Low-stock inventory

    prisma.part.findMany({
      where: {
        organizationId,

        isActive: true,

        qtyOnHand: {
          lte: prisma.part.fields.reorderPoint,
        },
      },

      select: {
        id: true,

        partNumber: true,

        description: true,

        location: true,

        qtyOnHand: true,

        qtyAllocated: true,

        qtyOnOrder: true,

        reorderPoint: true,
      },

      orderBy: [
        {
          qtyOnHand: "asc",
        },

        {
          partNumber: "asc",
        },
      ],

      take: 10,
    }),

    //************************************************************** */
    // Workflow — awaiting approval

    prisma.repairOrder.count({
      where: {
        organizationId,

        isActive: true,

        status: "AWAITING_CUSTOMER_APPROVAL",
      },
    }),

    //************************************************************** */
    // Workflow — waiting on parts

    prisma.repairOrder.count({
      where: {
        organizationId,

        isActive: true,

        status: "WAITING_ON_PARTS",
      },
    }),

    //************************************************************** */
    // Workflow — ready to work

    prisma.repairOrder.count({
      where: {
        organizationId,

        isActive: true,

        status: "READY_TO_WORK",
      },
    }),

    //************************************************************** */
    // Workflow — ready for pickup

    prisma.repairOrder.count({
      where: {
        organizationId,

        isActive: true,

        status: "READY_FOR_PICKUP",
      },
    }),

    //************************************************************** */
    // Parts demand — to be ordered

    prisma.repairOrderPartLine.count({
      where: {
        repairOrder: {
          organizationId,

          isActive: true,
        },

        status: "TO_BE_ORDERED",
      },
    }),

    //************************************************************** */
    // Parts demand — backordered

    prisma.repairOrderPartLine.count({
      where: {
        repairOrder: {
          organizationId,

          isActive: true,
        },

        status: "BACKORDERED",
      },
    }),

    //************************************************************** */
    // Month-to-date sales
    //
    // We retrieve the actual Sale rows here and let the service
    // calculate gross / returns / net / average consistently.

    prisma.sale.findMany({
      where: {
        organizationId,

        createdAt: {
          gte: monthStart,
          lt: monthEnd,
        },

        status: {
          not: "VOID",
        },
      },

      select: {
        id: true,

        type: true,

        status: true,

        total: true,

        refundedTotal: true,

        createdAt: true,
      },

      orderBy: {
        createdAt: "desc",
      },
    }),

    //************************************************************** */
    // Recent RO activity

    prisma.repairOrder.findMany({
      where: {
        organizationId,

        isActive: true,
      },

      select: {
        id: true,

        roNumber: true,

        status: true,

        priority: true,

        updatedAt: true,

        customer: {
          select: {
            type: true,

            firstName: true,

            lastName: true,

            companyName: true,
          },
        },

        vehicle: {
          select: {
            year: true,

            make: true,

            model: true,

            trim: true,
          },
        },
      },

      orderBy: {
        updatedAt: "desc",
      },

      take: 8,
    }),

    //************************************************************** */
    // Expected PO deliveries

    prisma.purchaseOrder.findMany({
      where: {
        organizationId,

        isActive: true,

        status: {
          in: [...ACTIVE_PURCHASE_ORDER_STATUSES],
        },

        expectedAt: {
          not: null,

          gte: now,
        },
      },

      select: {
        id: true,

        poNumber: true,

        vendorId: true,

        status: true,

        orderedAt: true,

        expectedAt: true,

        vendor: {
          select: {
            name: true,
          },
        },

        lines: {
          select: {
            orderedQty: true,

            receivedQty: true,
          },

          orderBy: {
            createdAt: "asc",
          },
        },
      },

      orderBy: [
        {
          expectedAt: "asc",
        },

        {
          poNumber: "asc",
        },
      ],

      take: 8,
    }),
  ]);

  //************************************************************** */

  return {
    openRepairOrders,

    completedThisMonth,

    lowStockAlertCount,

    lowStockParts,

    awaitingApproval,

    waitingOnParts,

    readyToWork,

    readyForPickup,

    toBeOrdered,

    backordered,

    monthSales,

    recentRepairOrders,

    expectedDeliveries,
  };
}

//************************************************************** */
