import {
  PartInventoryTransactionType,
} from "../../generated/prisma/client.js";

import {
  prisma,
} from "../../config/prisma.js";

//************************************************************** */

export interface InventoryMutationData {
  partId: string;

  type: PartInventoryTransactionType;

  quantity: number;

  onHandDelta?: number;
  allocatedDelta?: number;
  onOrderDelta?: number;

  referenceType?: string;
  referenceId?: string;

  notes?: string;

  createdByMembershipId: string | null;
}

//************************************************************** */

export async function applyInventoryMutation(
  data: InventoryMutationData,
) {
  return prisma.$transaction(
    async (transaction) => {
      const part =
        await transaction.part.findUnique({
          where: {
            id:
              data.partId,
          },
        });

      if (!part) {
        return null;
      }

      const onHandBefore =
        part.qtyOnHand;

      const allocatedBefore =
        part.qtyAllocated;

      const onOrderBefore =
        part.qtyOnOrder;

      const onHandAfter =
        onHandBefore.add(
          data.onHandDelta ?? 0,
        );

      const allocatedAfter =
        allocatedBefore.add(
          data.allocatedDelta ?? 0,
        );

      const onOrderAfter =
        onOrderBefore.add(
          data.onOrderDelta ?? 0,
        );

      const updatedPart =
        await transaction.part.update({
          where: {
            id:
              data.partId,
          },

          data: {
            qtyOnHand:
              onHandAfter,

            qtyAllocated:
              allocatedAfter,

            qtyOnOrder:
              onOrderAfter,
          },
        });

      const inventoryTransaction =
        await transaction.partInventoryTransaction.create({
          data: {
            partId:
              data.partId,

            type:
              data.type,

            quantity:
              data.quantity,

            onHandBefore,
            onHandAfter,

            allocatedBefore,
            allocatedAfter,

            onOrderBefore,
            onOrderAfter,

            referenceType:
              data.referenceType ??
              null,

            referenceId:
              data.referenceId ??
              null,

            notes:
              data.notes ??
              null,

            createdByMembershipId:
              data.createdByMembershipId,
          },
        });

      return {
        part:
          updatedPart,

        transaction:
          inventoryTransaction,
      };
    },
  );
}

//************************************************************** */

export async function setInventoryCount(
  partId: string,
  countedQuantity: number,
  createdByMembershipId: string | null,
  notes?: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const part =
        await transaction.part.findUnique({
          where: {
            id:
              partId,
          },
        });

      if (!part) {
        return null;
      }

      const onHandBefore =
        part.qtyOnHand;

      const allocatedBefore =
        part.qtyAllocated;

      const onOrderBefore =
        part.qtyOnOrder;

      const onHandAfter =
        countedQuantity;

      const quantity =
        Number(
          onHandAfter.toString(),
        ) -
        Number(
          onHandBefore.toString(),
        );

      const updatedPart =
        await transaction.part.update({
          where: {
            id:
              partId,
          },

          data: {
            qtyOnHand:
              onHandAfter,
          },
        });

      const inventoryTransaction =
        await transaction.partInventoryTransaction.create({
          data: {
            partId,

            type:
              PartInventoryTransactionType.CYCLE_COUNT,

            quantity,

            onHandBefore,
            onHandAfter,

            allocatedBefore,
            allocatedAfter:
              allocatedBefore,

            onOrderBefore,
            onOrderAfter:
              onOrderBefore,

            notes:
              notes ??
              null,

            createdByMembershipId,
          },
        });

      return {
        part:
          updatedPart,

        transaction:
          inventoryTransaction,
      };
    },
  );
}

//************************************************************** */

export async function findInventoryTransactions(
  partId: string,
) {
  return prisma.partInventoryTransaction.findMany({
    where: {
      partId,
    },

    include: {
      createdByMembership: {
        include: {
          user: true,
        },
      },
    },

    orderBy: {
      createdAt:
        "desc",
    },
  });
}