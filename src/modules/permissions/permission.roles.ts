import {
  MembershipRole,
} from "../../generated/prisma/client.js";
import {
  Permissions,
  type Permission,
} from "./permission.constants.js";
import type {
  RolePermissionMap,
} from "./permission.types.js";

//************************************************************** */

const allPermissions = Object.values(
  Permissions,
) as Permission[];

//************************************************************** */

export const rolePermissions: RolePermissionMap = {
  [MembershipRole.OWNER]: new Set(
    allPermissions,
  ),

  [MembershipRole.ADMIN]: new Set([
    Permissions.ORGANIZATION_VIEW,
    Permissions.ORGANIZATION_UPDATE,

    Permissions.MEMBERSHIPS_VIEW,
    Permissions.MEMBERSHIPS_CREATE,
    Permissions.MEMBERSHIPS_UPDATE,
    Permissions.MEMBERSHIPS_DELETE,
    Permissions.MEMBERSHIPS_INVITE,

    Permissions.CUSTOMERS_VIEW,
    Permissions.CUSTOMERS_CREATE,
    Permissions.CUSTOMERS_UPDATE,
    Permissions.CUSTOMERS_DELETE,
    Permissions.CUSTOMERS_EXPORT,

    Permissions.UNITS_VIEW,
    Permissions.UNITS_CREATE,
    Permissions.UNITS_UPDATE,
    Permissions.UNITS_DELETE,
    Permissions.UNITS_IMPORT,
    Permissions.UNITS_EXPORT,

    Permissions.SERVICE_VIEW,
    Permissions.SERVICE_CREATE,
    Permissions.SERVICE_UPDATE,
    Permissions.SERVICE_ASSIGN,
    Permissions.SERVICE_CLOSE,

    Permissions.REPAIR_ORDERS_VIEW,
    Permissions.REPAIR_ORDERS_CREATE,
    Permissions.REPAIR_ORDERS_UPDATE,
    Permissions.REPAIR_ORDERS_DELETE,
    Permissions.REPAIR_ORDERS_ASSIGN,
    Permissions.REPAIR_ORDERS_APPROVE,
    Permissions.REPAIR_ORDERS_CLOSE,

    Permissions.LABOR_VIEW,
    Permissions.LABOR_CREATE,
    Permissions.LABOR_UPDATE,
    Permissions.LABOR_DELETE,

    Permissions.PARTS_VIEW,
    Permissions.PARTS_CREATE,
    Permissions.PARTS_UPDATE,
    Permissions.PARTS_DELETE,
    Permissions.PARTS_RECEIVE,
    Permissions.PARTS_RETURN,

    Permissions.INVENTORY_VIEW,
    Permissions.INVENTORY_CREATE,
    Permissions.INVENTORY_UPDATE,
    Permissions.INVENTORY_DELETE,
    Permissions.INVENTORY_ADJUST,
    Permissions.INVENTORY_TRANSFER,

    Permissions.PURCHASE_ORDERS_VIEW,
    Permissions.PURCHASE_ORDERS_CREATE,
    Permissions.PURCHASE_ORDERS_UPDATE,
    Permissions.PURCHASE_ORDERS_DELETE,
    Permissions.PURCHASE_ORDERS_APPROVE,
    Permissions.PURCHASE_ORDERS_RECEIVE,

    Permissions.SCHEDULING_VIEW,
    Permissions.SCHEDULING_CREATE,
    Permissions.SCHEDULING_UPDATE,
    Permissions.SCHEDULING_DELETE,

    Permissions.DOCUMENTS_VIEW,
    Permissions.DOCUMENTS_CREATE,
    Permissions.DOCUMENTS_UPDATE,
    Permissions.DOCUMENTS_DELETE,

    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_EXPORT,
    Permissions.ANALYTICS_VIEW,

    Permissions.BILLING_VIEW,
    Permissions.AUDIT_VIEW,

    Permissions.SETTINGS_VIEW,
    Permissions.SETTINGS_UPDATE,
  ]),

  [MembershipRole.MANAGER]: new Set([
    Permissions.ORGANIZATION_VIEW,

    Permissions.MEMBERSHIPS_VIEW,
    // Permissions.MEMBERSHIPS_UPDATE,

    Permissions.CUSTOMERS_VIEW,
    Permissions.CUSTOMERS_CREATE,
    Permissions.CUSTOMERS_UPDATE,
    Permissions.CUSTOMERS_EXPORT,

    Permissions.UNITS_VIEW,
    Permissions.UNITS_CREATE,
    Permissions.UNITS_UPDATE,
    Permissions.UNITS_IMPORT,
    Permissions.UNITS_EXPORT,

    Permissions.SERVICE_VIEW,
    Permissions.SERVICE_CREATE,
    Permissions.SERVICE_UPDATE,
    Permissions.SERVICE_ASSIGN,
    Permissions.SERVICE_CLOSE,

    Permissions.REPAIR_ORDERS_VIEW,
    Permissions.REPAIR_ORDERS_CREATE,
    Permissions.REPAIR_ORDERS_UPDATE,
    Permissions.REPAIR_ORDERS_ASSIGN,
    Permissions.REPAIR_ORDERS_APPROVE,
    Permissions.REPAIR_ORDERS_CLOSE,

    Permissions.LABOR_VIEW,
    Permissions.LABOR_CREATE,
    Permissions.LABOR_UPDATE,

    Permissions.PARTS_VIEW,
    Permissions.PARTS_CREATE,
    Permissions.PARTS_UPDATE,
    Permissions.PARTS_RECEIVE,
    Permissions.PARTS_RETURN,

    Permissions.INVENTORY_VIEW,
    Permissions.INVENTORY_CREATE,
    Permissions.INVENTORY_UPDATE,
    Permissions.INVENTORY_ADJUST,
    Permissions.INVENTORY_TRANSFER,

    Permissions.PURCHASE_ORDERS_VIEW,
    Permissions.PURCHASE_ORDERS_CREATE,
    Permissions.PURCHASE_ORDERS_UPDATE,
    Permissions.PURCHASE_ORDERS_APPROVE,
    Permissions.PURCHASE_ORDERS_RECEIVE,

    Permissions.SCHEDULING_VIEW,
    Permissions.SCHEDULING_CREATE,
    Permissions.SCHEDULING_UPDATE,
    Permissions.SCHEDULING_DELETE,

    Permissions.DOCUMENTS_VIEW,
    Permissions.DOCUMENTS_CREATE,
    Permissions.DOCUMENTS_UPDATE,

    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_EXPORT,
    Permissions.ANALYTICS_VIEW,

    Permissions.SETTINGS_VIEW,
  ]),

  [MembershipRole.SERVICE_ADVISOR]: new Set([
    Permissions.CUSTOMERS_VIEW,
    Permissions.CUSTOMERS_CREATE,
    Permissions.CUSTOMERS_UPDATE,

    Permissions.UNITS_VIEW,
    Permissions.UNITS_CREATE,
    Permissions.UNITS_UPDATE,

    Permissions.SERVICE_VIEW,
    Permissions.SERVICE_CREATE,
    Permissions.SERVICE_UPDATE,
    Permissions.SERVICE_ASSIGN,
    Permissions.SERVICE_CLOSE,

    Permissions.REPAIR_ORDERS_VIEW,
    Permissions.REPAIR_ORDERS_CREATE,
    Permissions.REPAIR_ORDERS_UPDATE,
    Permissions.REPAIR_ORDERS_ASSIGN,
    Permissions.REPAIR_ORDERS_APPROVE,
    Permissions.REPAIR_ORDERS_CLOSE,

    Permissions.LABOR_VIEW,
    Permissions.LABOR_CREATE,
    Permissions.LABOR_UPDATE,

    Permissions.PARTS_VIEW,
    Permissions.INVENTORY_VIEW,
    Permissions.PURCHASE_ORDERS_VIEW,

    Permissions.SCHEDULING_VIEW,
    Permissions.SCHEDULING_CREATE,
    Permissions.SCHEDULING_UPDATE,

    Permissions.DOCUMENTS_VIEW,
    Permissions.DOCUMENTS_CREATE,
    Permissions.DOCUMENTS_UPDATE,
  ]),

  [MembershipRole.TECHNICIAN]: new Set([
    Permissions.CUSTOMERS_VIEW,
    Permissions.UNITS_VIEW,

    Permissions.SERVICE_VIEW,
    Permissions.SERVICE_UPDATE,

    Permissions.REPAIR_ORDERS_VIEW,
    Permissions.REPAIR_ORDERS_UPDATE,

    Permissions.LABOR_VIEW,
    Permissions.LABOR_CREATE,
    Permissions.LABOR_UPDATE,

    Permissions.PARTS_VIEW,
    Permissions.INVENTORY_VIEW,

    Permissions.SCHEDULING_VIEW,

    Permissions.DOCUMENTS_VIEW,
    Permissions.DOCUMENTS_CREATE,
  ]),

  [MembershipRole.PARTS]: new Set([
    Permissions.CUSTOMERS_VIEW,
    Permissions.UNITS_VIEW,

    Permissions.REPAIR_ORDERS_VIEW,
    Permissions.REPAIR_ORDERS_UPDATE,

    Permissions.PARTS_VIEW,
    Permissions.PARTS_CREATE,
    Permissions.PARTS_UPDATE,
    Permissions.PARTS_RECEIVE,
    Permissions.PARTS_RETURN,

    Permissions.INVENTORY_VIEW,
    Permissions.INVENTORY_CREATE,
    Permissions.INVENTORY_UPDATE,
    Permissions.INVENTORY_ADJUST,
    Permissions.INVENTORY_TRANSFER,

    Permissions.PURCHASE_ORDERS_VIEW,
    Permissions.PURCHASE_ORDERS_CREATE,
    Permissions.PURCHASE_ORDERS_UPDATE,
    Permissions.PURCHASE_ORDERS_RECEIVE,

    Permissions.DOCUMENTS_VIEW,
    Permissions.DOCUMENTS_CREATE,
  ]),
};

//************************************************************** */