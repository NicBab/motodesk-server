import { prisma } from "../../config/prisma.js";

import type { ListPartOrderDemandQueryInput } from "./part-order-demand.schemas.js";

//************************************************************** */

export async function findPartOrderDemand(
  organizationId: string,
  query: ListPartOrderDemandQueryInput,
) {
  return prisma.repairOrderPartLine.findMany({
    where: {
      repairOrder: {
        organizationId,

        isActive: true,
      },

      status: {
        in: ["NEEDS_REVIEW", "TO_BE_ORDERED"],
      },

      OR: [
        {
          resolutionMethod: null,
        },
        {
          resolutionMethod: {
            not: "NOT_REQUIRED",
          },
        },
      ],

      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  {
                    resolutionMethod: null,
                  },
                  {
                    resolutionMethod: {
                      not: "NOT_REQUIRED",
                    },
                  },
                ],
              },

              {
                OR: [
                  {
                    partNumber: {
                      contains: query.search,

                      mode: "insensitive",
                    },
                  },

                  {
                    description: {
                      contains: query.search,

                      mode: "insensitive",
                    },
                  },

                  {
                    vendorName: {
                      contains: query.search,

                      mode: "insensitive",
                    },
                  },

                  {
                    repairOrder: {
                      customer: {
                        OR: [
                          {
                            firstName: {
                              contains: query.search,

                              mode: "insensitive",
                            },
                          },

                          {
                            lastName: {
                              contains: query.search,

                              mode: "insensitive",
                            },
                          },

                          {
                            companyName: {
                              contains: query.search,

                              mode: "insensitive",
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          }
        : {
            OR: [
              {
                resolutionMethod: null,
              },
              {
                resolutionMethod: {
                  not: "NOT_REQUIRED",
                },
              },
            ],
          }),
    },

    include: {
      part: true,

      repairOrder: {
        include: {
          customer: true,

          vehicle: true,
        },
      },

      purchaseOrderLines: {
        include: {
          purchaseOrder: true,
        },
      },
    },

    orderBy: [
      {
        repairOrder: {
          createdAt: "asc",
        },
      },

      {
        createdAt: "asc",
      },
    ],
  });
}

//************************************************************** */
