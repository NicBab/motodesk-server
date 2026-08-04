export const AUDIT_ACTIONS = {
  AUTH_REGISTERED: "auth.registered",
  AUTH_LOGIN_SUCCEEDED: "auth.login.succeeded",
  AUTH_LOGIN_FAILED: "auth.login.failed",
  AUTH_LOGOUT: "auth.logout",
  AUTH_LOGOUT_ALL: "auth.logout_all",
  AUTH_SESSION_REFRESHED: "auth.session_refreshed",
  AUTH_PASSWORD_CHANGED: "auth.password_changed",
  AUTH_EMAIL_CHANGED: "auth.email_changed",

  ORGANIZATION_CREATED: "organization.created",
  ORGANIZATION_UPDATED: "organization.updated",
  ORGANIZATION_ARCHIVED: "organization.archived",

  MEMBERSHIP_CREATED: "membership.created",
  MEMBERSHIP_UPDATED: "membership.updated",
  MEMBERSHIP_SUSPENDED: "membership.suspended",
  MEMBERSHIP_REMOVED: "membership.removed",

  INVITATION_CREATED: "invitation.created",
  INVITATION_ACCEPTED: "invitation.accepted",
  INVITATION_REVOKED: "invitation.revoked",
  INVITATION_EXPIRED: "invitation.expired",
} as const;

//************************************************************** */

export type AuditAction =
  (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

//************************************************************** */

export const AUDIT_ENTITY_TYPES = {
  USER: "User",
  SESSION: "Session",
  ORGANIZATION: "Organization",
  MEMBERSHIP: "Membership",
  INVITATION: "Invitation",
} as const;

//************************************************************** */


export type AuditEntityType =
  (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES];

  //************************************************************** */