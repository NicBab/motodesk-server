import { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";
import type { CreateAuditLogInput } from "./audit.types.js";
import { sanitizeAuditValue } from "./audit.utils.js";

//************************************************************** */

function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue {
  const sanitizedValue = sanitizeAuditValue(value);

  if (
    sanitizedValue === null ||
    sanitizedValue === undefined
  ) {
    return {};
  }

  return sanitizedValue as Prisma.InputJsonValue;
}

//************************************************************** */

function buildAuditMetadata(
  input: CreateAuditLogInput,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
  };

  if (input.before !== undefined) {
    metadata.before = input.before;
  }

  if (input.after !== undefined) {
    metadata.after = input.after;
  }

  if (input.actor?.sessionId) {
    metadata.sessionId = input.actor.sessionId;
  }

  if (input.context?.requestId) {
    metadata.requestId = input.context.requestId;
  }

  if (Object.keys(metadata).length === 0) {
    return Prisma.JsonNull;
  }

  return toPrismaJson(metadata);
}

//************************************************************** */
export async function createAuditLog(
  input: CreateAuditLogInput,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      resourceType: input.entityType,

      ...(input.entityId
        ? {
            resourceId: input.entityId,
          }
        : {}),

      ...(input.actor?.userId
        ? {
            actorUserId: input.actor.userId,
          }
        : {}),

      ...(input.actor?.organizationId
        ? {
            organizationId:
              input.actor.organizationId,
          }
        : {}),

      ...(input.context?.ipAddress
        ? {
            ipAddress: input.context.ipAddress,
          }
        : {}),

      ...(input.context?.userAgent
        ? {
            userAgent: input.context.userAgent,
          }
        : {}),

      metadata: buildAuditMetadata(input),
    },
  });
}

//************************************************************** */