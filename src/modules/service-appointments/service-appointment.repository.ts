import {
  prisma,
} from "../../config/prisma.js";

import type {
  CreateServiceAppointmentInput,
  ListServiceAppointmentsQueryInput,
} from "./service-appointment.schemas.js";

//************************************************************** */

const serviceAppointmentInclude = {
  customer:
    true,

  vehicle:
    true,

  preferredTechnician: {
    include: {
      membership: {
        include: {
          user:
            true,
        },
      },
    },
  },

  serviceAdvisor: {
    include: {
      membership: {
        include: {
          user:
            true,
        },
      },
    },
  },

  repairOrder: {
    select: {
      id:
        true,

      roNumber:
        true,

      status:
        true,
    },
  },
} as const;

//************************************************************** */

export async function createServiceAppointmentRecord(
  organizationId: string,
  customerName: string,
  input: CreateServiceAppointmentInput,
) {
  return prisma.$transaction(
    async (
      transaction,
    ) => {
      const sequence =
        await transaction.serviceAppointmentSequence.upsert({
          where: {
            organizationId,
          },

          update: {
            nextNumber: {
              increment:
                1,
            },
          },

          create: {
            organizationId,

            nextNumber:
              1002,
          },
        });

      const appointmentNumber =
        sequence.nextNumber -
        1;

      return transaction.serviceAppointment.create({
        data: {
          organizationId,

          appointmentNumber,

          customerId:
            input.customerId ??
            null,

          vehicleId:
            input.vehicleId ??
            null,

          customerName,

          appointmentType:
            input.appointmentType,

          status:
            "REQUESTED",

          requestedService:
            input.requestedService,

          customerComplaint:
            input.customerComplaint ??
            null,

          scheduledStart:
            input.scheduledStart,

          scheduledEnd:
            input.scheduledEnd,

          estimatedDurationMinutes:
            input.estimatedDurationMinutes,

          preferredTechnicianEmployeeId:
            input.preferredTechnicianEmployeeId ??
            null,

          serviceAdvisorEmployeeId:
            input.serviceAdvisorEmployeeId ??
            null,

          waitingCustomer:
            input.waitingCustomer,

          transportationNeeded:
            input.transportationNeeded,

          contactMethod:
            input.contactMethod ??
            null,

          internalNotes:
            input.internalNotes ??
            null,

          customerNotes:
            input.customerNotes ??
            null,
        },

        include:
          serviceAppointmentInclude,
      });
    },
  );
}

//************************************************************** */

export async function findServiceAppointmentById(
  organizationId: string,
  appointmentId: string,
) {
  return prisma.serviceAppointment.findFirst({
    where: {
      id:
        appointmentId,

      organizationId,
    },

    include:
      serviceAppointmentInclude,
  });
}

//************************************************************** */

export async function findServiceAppointmentsByOrganization(
  organizationId: string,
  query: ListServiceAppointmentsQueryInput,
) {
  const numericSearch =
    query.search &&
    /^\d+$/.test(
      query.search,
    )
      ? Number(
          query.search,
        )
      : null;

  return prisma.serviceAppointment.findMany({
    where: {
      organizationId,

      ...(query.status
        ? {
            status:
              query.status,
          }
        : {}),

      ...(query.start ||
      query.end
        ? {
            scheduledStart: {
              ...(query.start
                ? {
                    gte:
                      query.start,
                  }
                : {}),

              ...(query.end
                ? {
                    lt:
                      query.end,
                  }
                : {}),
            },
          }
        : {}),

      ...(query.search
        ? {
            OR: [
              ...(numericSearch !==
              null
                ? [
                    {
                      appointmentNumber:
                        numericSearch,
                    },
                  ]
                : []),

              {
                requestedService: {
                  contains:
                    query.search,

                  mode:
                    "insensitive",
                },
              },

              {
                customerComplaint: {
                  contains:
                    query.search,

                  mode:
                    "insensitive",
                },
              },

              {
                customerName: {
                  contains:
                    query.search,

                  mode:
                    "insensitive",
                },
              },

              {
                vehicle: {
                  is: {
                    make: {
                      contains:
                        query.search,

                      mode:
                        "insensitive",
                    },
                  },
                },
              },

              {
                vehicle: {
                  is: {
                    model: {
                      contains:
                        query.search,

                      mode:
                        "insensitive",
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },

    include:
      serviceAppointmentInclude,

    orderBy: [
      {
        scheduledStart:
          "desc",
      },

      {
        appointmentNumber:
          "desc",
      },
    ],
  });
}

//************************************************************** */

export async function confirmServiceAppointmentRecord(
  organizationId: string,
  appointmentId: string,
) {
  return prisma.$transaction(
    async (
      transaction,
    ) => {
      const update =
        await transaction.serviceAppointment.updateMany({
          where: {
            id:
              appointmentId,

            organizationId,

            status:
              "REQUESTED",
          },

          data: {
            status:
              "CONFIRMED",

            confirmedAt:
              new Date(),
          },
        });

      if (
        update.count !==
        1
      ) {
        return null;
      }

      return transaction.serviceAppointment.findUnique({
        where: {
          id:
            appointmentId,
        },

        include:
          serviceAppointmentInclude,
      });
    },
  );
}

//************************************************************** */

export async function checkInServiceAppointmentRecord(
  organizationId: string,
  appointmentId: string,
) {
  return prisma.$transaction(
    async (
      transaction,
    ) => {
      const update =
        await transaction.serviceAppointment.updateMany({
          where: {
            id:
              appointmentId,

            organizationId,

            status:
              "CONFIRMED",
          },

          data: {
            status:
              "CHECKED_IN",

            checkedInAt:
              new Date(),
          },
        });

      if (
        update.count !==
        1
      ) {
        return null;
      }

      return transaction.serviceAppointment.findUnique({
        where: {
          id:
            appointmentId,
        },

        include:
          serviceAppointmentInclude,
      });
    },
  );
}

//************************************************************** */

export async function cancelServiceAppointmentRecord(
  organizationId: string,
  appointmentId: string,
  reason:
    | string
    | undefined,
) {
  return prisma.$transaction(
    async (
      transaction,
    ) => {
      const update =
        await transaction.serviceAppointment.updateMany({
          where: {
            id:
              appointmentId,

            organizationId,

            status: {
              notIn: [
                "CANCELLED",
                "CONVERTED_TO_RO",
                "COMPLETED",
              ],
            },
          },

          data: {
            status:
              "CANCELLED",

            cancelledAt:
              new Date(),

            cancelReason:
              reason ??
              null,
          },
        });

      if (
        update.count !==
        1
      ) {
        return null;
      }

      return transaction.serviceAppointment.findUnique({
        where: {
          id:
            appointmentId,
        },

        include:
          serviceAppointmentInclude,
      });
    },
  );
}

//************************************************************** */

export async function convertServiceAppointmentToRepairOrderRecord(
  organizationId: string,
  appointmentId: string,
  changedByMembershipId:
    | string
    | null,
  serviceAdvisorMembershipId:
    | string
    | null,
) {
  return prisma.$transaction(
    async (
      transaction,
    ) => {
      const appointment =
        await transaction.serviceAppointment.findFirst({
          where: {
            id:
              appointmentId,

            organizationId,

            repairOrderId:
              null,

            status: {
              in: [
                "CONFIRMED",
                "CHECKED_IN",
              ],
            },
          },
        });

      if (
        !appointment ||
        !appointment.customerId ||
        !appointment.vehicleId
      ) {
        return null;
      }

      //************************************************************** */
      // Claim appointment before creating the RO.
      //
      // This protects against two simultaneous conversion requests.

      const appointmentUpdate =
        await transaction.serviceAppointment.updateMany({
          where: {
            id:
              appointment.id,

            organizationId,

            repairOrderId:
              null,

            status: {
              in: [
                "CONFIRMED",
                "CHECKED_IN",
              ],
            },
          },

          data: {
            status:
              "CONVERTED_TO_RO",
          },
        });

      if (
        appointmentUpdate.count !==
        1
      ) {
        return null;
      }

      //************************************************************** */
      // Organization-scoped RO number.

      const sequence =
        await transaction.repairOrderSequence.upsert({
          where: {
            organizationId,
          },

          update: {
            nextNumber: {
              increment:
                1,
            },
          },

          create: {
            organizationId,

            nextNumber:
              1002,
          },
        });

      const roNumber =
        sequence.nextNumber -
        1;

      //************************************************************** */
      // Create ESTIMATE RO.

      const repairOrder =
        await transaction.repairOrder.create({
          data: {
            organizationId,

            customerId:
              appointment.customerId,

            vehicleId:
              appointment.vehicleId,

            roNumber,

            status:
              "ESTIMATE",

            priority:
              "STANDARD",

            serviceAdvisorMembershipId,

            primaryTechnicianMembershipId:
              null,

            scheduledDate:
              appointment.scheduledStart,

            promisedDate:
              null,

            complaint:
              appointment.customerComplaint ??
              appointment.requestedService,

            notes:
              appointment.internalNotes,

            shopSuppliesRate:
              6,

            discount:
              0,

            deposit:
              0,

            cashierStatus:
              "NOT_CASHIERED",

            paymentRemote:
              false,

            remainingBalance:
              0,

            pickupStatus:
              "NOT_READY",

            statusHistory: {
              create: {
                status:
                  "ESTIMATE",

                previousStatus:
                  null,

                changedByMembershipId,

                automatic:
                  false,

                notes:
                  `Created from service appointment #${appointment.appointmentNumber}.`,
              },
            },
          },

          include: {
            customer:
              true,

            vehicle:
              true,

            statusHistory: {
              orderBy: {
                changedAt:
                  "asc",
              },
            },
          },
        });

      //************************************************************** */
      // Link appointment to created RO.

      const convertedAppointment =
        await transaction.serviceAppointment.update({
          where: {
            id:
              appointment.id,
          },

          data: {
            repairOrderId:
              repairOrder.id,
          },

          include:
            serviceAppointmentInclude,
        });

      return {
        appointment:
          convertedAppointment,

        repairOrder,
      };
    },
  );
}

//************************************************************** */