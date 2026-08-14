import {
  prisma,
} from "../../config/prisma.js";

import type {
  CreateRepairOrderInput,
  ListRepairOrdersQueryInput,
  UpdateRepairOrderInput,
  UpdateRepairOrderStatusInput,
} from "./repair-order.schemas.js";

//************************************************************** */

export async function createRepairOrderRecord(
  organizationId: string,
  input: CreateRepairOrderInput,
  changedByMembershipId: string | null,
) {
  return prisma.$transaction(
    async (transaction) => {
      const sequence =
        await transaction.repairOrderSequence.upsert({
          where: {
            organizationId,
          },

          update: {
            nextNumber: {
              increment: 1,
            },
          },

          create: {
            organizationId,
            nextNumber: 1002,
          },
        });

      const roNumber =
        sequence.nextNumber - 1;

      return transaction.repairOrder.create({
        data: {
          organizationId,
          customerId:
            input.customerId,
          vehicleId:
            input.vehicleId,

          roNumber,

          status:
            input.status,

          priority:
            input.priority,

          serviceAdvisorMembershipId:
            input.serviceAdvisorMembershipId ??
            null,

          primaryTechnicianMembershipId:
            input.primaryTechnicianMembershipId ??
            null,

          promisedDate:
            input.promisedDate ??
            null,

          scheduledDate:
            input.scheduledDate ??
            null,

          complaint:
            input.complaint ??
            null,

          notes:
            input.notes ??
            null,

          taxRate:
            input.taxRate ??
            null,

          shopSuppliesRate:
            input.shopSuppliesRate,

          discount:
            input.discount,

          deposit:
            input.deposit,

          approvalMethod:
            input.approvalMethod ??
            null,

          approvalDate:
            input.approvalDate ??
            null,

          approvedBy:
            input.approvedBy ??
            null,

          approvedAmount:
            input.approvedAmount ??
            null,

          approvalNotes:
            input.approvalNotes ??
            null,

          cashierStatus:
            input.cashierStatus,

          cashieredDate:
            input.cashieredDate ??
            null,

          paymentReference:
            input.paymentReference ??
            null,

          paymentRemote:
            input.paymentRemote,

          remainingBalance:
            input.remainingBalance,

          pickupStatus:
            input.pickupStatus,

          pickupDate:
            input.pickupDate ??
            null,

          pickupRecipient:
            input.pickupRecipient ??
            null,

          pickupNotes:
            input.pickupNotes ??
            null,

          statusHistory: {
            create: {
              status:
                input.status,
              previousStatus:
                null,
              changedByMembershipId,
              automatic:
                false,
              notes:
                "Repair order created.",
            },
          },
        },

        include: {
          customer: true,
          vehicle: true,
          statusHistory: {
            orderBy: {
              changedAt:
                "asc",
            },
          },
        },
      });
    },
  );
}

//************************************************************** */

export async function findRepairOrderById(
  organizationId: string,
  repairOrderId: string,
) {
  return prisma.repairOrder.findFirst({
    where: {
      id:
        repairOrderId,
      organizationId,
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

      statusHistory: {
        include: {
          changedByMembership: {
            include: {
              user: true,
            },
          },
        },

        orderBy: {
          changedAt:
            "asc",
        },
      },
    },
  });
}

//************************************************************** */

export async function findRepairOrdersByOrganization(
  organizationId: string,
  query: ListRepairOrdersQueryInput,
) {
  return prisma.repairOrder.findMany({
    where: {
      organizationId,

      ...(query.customerId !== undefined
        ? {
            customerId:
              query.customerId,
          }
        : {}),

      ...(query.vehicleId !== undefined
        ? {
            vehicleId:
              query.vehicleId,
          }
        : {}),

      ...(query.status !== undefined
        ? {
            status:
              query.status,
          }
        : {}),

      ...(query.priority !== undefined
        ? {
            priority:
              query.priority,
          }
        : {}),

      ...(query.serviceAdvisorMembershipId !== undefined
        ? {
            serviceAdvisorMembershipId:
              query.serviceAdvisorMembershipId,
          }
        : {}),

      ...(query.primaryTechnicianMembershipId !== undefined
        ? {
            primaryTechnicianMembershipId:
              query.primaryTechnicianMembershipId,
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
                complaint: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },

              {
                notes: {
                  contains:
                    query.search,
                  mode:
                    "insensitive",
                },
              },

              {
                customer: {
                  OR: [
                    {
                      firstName: {
                        contains:
                          query.search,
                        mode:
                          "insensitive",
                      },
                    },

                    {
                      lastName: {
                        contains:
                          query.search,
                        mode:
                          "insensitive",
                      },
                    },

                    {
                      companyName: {
                        contains:
                          query.search,
                        mode:
                          "insensitive",
                      },
                    },
                  ],
                },
              },

              {
                vehicle: {
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
                      vin: {
                        contains:
                          query.search,
                        mode:
                          "insensitive",
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
    },

    include: {
      customer: true,
      vehicle: true,
    },

    orderBy: [
      {
        priority:
          "desc",
      },

      {
        createdAt:
          "desc",
      },
    ],
  });
}

//************************************************************** */

export async function updateRepairOrderRecord(
  organizationId: string,
  repairOrderId: string,
  input: UpdateRepairOrderInput,
) {
  return prisma.repairOrder.updateMany({
    where: {
      id:
        repairOrderId,
      organizationId,
    },

    data: {
      ...(input.priority !== undefined
        ? {
            priority:
              input.priority,
          }
        : {}),

      ...(input.serviceAdvisorMembershipId !== undefined
        ? {
            serviceAdvisorMembershipId:
              input.serviceAdvisorMembershipId,
          }
        : {}),

      ...(input.primaryTechnicianMembershipId !== undefined
        ? {
            primaryTechnicianMembershipId:
              input.primaryTechnicianMembershipId,
          }
        : {}),

      ...(input.promisedDate !== undefined
        ? {
            promisedDate:
              input.promisedDate,
          }
        : {}),

      ...(input.scheduledDate !== undefined
        ? {
            scheduledDate:
              input.scheduledDate,
          }
        : {}),

      ...(input.complaint !== undefined
        ? {
            complaint:
              input.complaint,
          }
        : {}),

      ...(input.notes !== undefined
        ? {
            notes:
              input.notes,
          }
        : {}),

      ...(input.taxRate !== undefined
        ? {
            taxRate:
              input.taxRate,
          }
        : {}),

      ...(input.shopSuppliesRate !== undefined
        ? {
            shopSuppliesRate:
              input.shopSuppliesRate,
          }
        : {}),

      ...(input.discount !== undefined
        ? {
            discount:
              input.discount,
          }
        : {}),

      ...(input.deposit !== undefined
        ? {
            deposit:
              input.deposit,
          }
        : {}),

      ...(input.approvalMethod !== undefined
        ? {
            approvalMethod:
              input.approvalMethod,
          }
        : {}),

      ...(input.approvalDate !== undefined
        ? {
            approvalDate:
              input.approvalDate,
          }
        : {}),

      ...(input.approvedBy !== undefined
        ? {
            approvedBy:
              input.approvedBy,
          }
        : {}),

      ...(input.approvedAmount !== undefined
        ? {
            approvedAmount:
              input.approvedAmount,
          }
        : {}),

      ...(input.approvalNotes !== undefined
        ? {
            approvalNotes:
              input.approvalNotes,
          }
        : {}),

      ...(input.cashierStatus !== undefined
        ? {
            cashierStatus:
              input.cashierStatus,
          }
        : {}),

      ...(input.cashieredDate !== undefined
        ? {
            cashieredDate:
              input.cashieredDate,
          }
        : {}),

      ...(input.paymentReference !== undefined
        ? {
            paymentReference:
              input.paymentReference,
          }
        : {}),

      ...(input.paymentRemote !== undefined
        ? {
            paymentRemote:
              input.paymentRemote,
          }
        : {}),

      ...(input.remainingBalance !== undefined
        ? {
            remainingBalance:
              input.remainingBalance,
          }
        : {}),

      ...(input.pickupStatus !== undefined
        ? {
            pickupStatus:
              input.pickupStatus,
          }
        : {}),

      ...(input.pickupDate !== undefined
        ? {
            pickupDate:
              input.pickupDate,
          }
        : {}),

      ...(input.pickupRecipient !== undefined
        ? {
            pickupRecipient:
              input.pickupRecipient,
          }
        : {}),

      ...(input.pickupNotes !== undefined
        ? {
            pickupNotes:
              input.pickupNotes,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function updateRepairOrderStatusRecord(
  organizationId: string,
  repairOrderId: string,
  previousStatus: string,
  input: UpdateRepairOrderStatusInput,
  changedByMembershipId: string | null,
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.repairOrder.updateMany({
        where: {
          id:
            repairOrderId,
          organizationId,
        },

        data: {
          status:
            input.status,
        },
      });

      await transaction.repairOrderStatusHistory.create({
        data: {
          repairOrderId,
          status:
            input.status,
          previousStatus:
            previousStatus as never,
          changedByMembershipId,
          notes:
            input.notes ?? null,
          automatic:
            input.automatic,
        },
      });
    },
  );
}