import type {
  AuditAction,
  AuditEntityType,
} from "./audit.constants.js";

//************************************************************** 

// This keeps request context, actor information, and entity metadata consistent before we connect the service to Prisma.
// Identifies who performed the action and under which tenant/session: */

export interface AuditActor {
  userId?: string;
  organizationId?: string;
  sessionId?: string;
}

//************************************************************** */

export interface AuditRequestContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

//************************************************************** */

export interface CreateAuditLogInput {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;

  actor?: AuditActor;
  context?: AuditRequestContext;

  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

//************************************************************** */