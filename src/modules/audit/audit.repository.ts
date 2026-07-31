import type {
  Prisma,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

//************************************************************** */

export interface CreateAuditRecordData {
  action: string;
  resourceType: string;

  resourceId?: string;
  actorUserId?: string;
  organizationId?: string;

  ipAddress?: string;
  userAgent?: string;

  metadata:
    | Prisma.InputJsonValue
    | typeof Prisma.JsonNull;
}

//************************************************************** */

export async function createAuditRecord(
  data: CreateAuditRecordData,
) {
  return prisma.auditLog.create({
    data: {
      action: data.action,
      resourceType: data.resourceType,
      metadata: data.metadata,

      ...(data.resourceId !== undefined
        ? {
            resourceId: data.resourceId,
          }
        : {}),

      ...(data.actorUserId !== undefined
        ? {
            actorUserId: data.actorUserId,
          }
        : {}),

      ...(data.organizationId !== undefined
        ? {
            organizationId:
              data.organizationId,
          }
        : {}),

      ...(data.ipAddress !== undefined
        ? {
            ipAddress: data.ipAddress,
          }
        : {}),

      ...(data.userAgent !== undefined
        ? {
            userAgent: data.userAgent,
          }
        : {}),
    },
  });
}