//************************************************************** */

export const Permissions = {
  // Organization
  ORGANIZATION_VIEW: "organization:view",
  ORGANIZATION_UPDATE: "organization:update",
  ORGANIZATION_DELETE: "organization:delete",

  // Memberships
  MEMBERSHIPS_VIEW: "memberships:view",
  MEMBERSHIPS_CREATE: "memberships:create",
  MEMBERSHIPS_UPDATE: "memberships:update",
  MEMBERSHIPS_DELETE: "memberships:delete",
  MEMBERSHIPS_INVITE: "memberships:invite",

  // Customers
  CUSTOMERS_VIEW: "customers:view",
  CUSTOMERS_CREATE: "customers:create",
  CUSTOMERS_UPDATE: "customers:update",
  CUSTOMERS_DELETE: "customers:delete",
  CUSTOMERS_EXPORT: "customers:export",

  // Units
  UNITS_VIEW: "units:view",
  UNITS_CREATE: "units:create",
  UNITS_UPDATE: "units:update",
  UNITS_DELETE: "units:delete",
  UNITS_IMPORT: "units:import",
  UNITS_EXPORT: "units:export",

  // Service
  SERVICE_VIEW: "service:view",
  SERVICE_CREATE: "service:create",
  SERVICE_UPDATE: "service:update",
  SERVICE_ASSIGN: "service:assign",
  SERVICE_CLOSE: "service:close",

  // Repair Orders
  REPAIR_ORDERS_VIEW: "repair_orders:view",
  REPAIR_ORDERS_CREATE: "repair_orders:create",
  REPAIR_ORDERS_UPDATE: "repair_orders:update",
  REPAIR_ORDERS_DELETE: "repair_orders:delete",
  REPAIR_ORDERS_ASSIGN: "repair_orders:assign",
  REPAIR_ORDERS_APPROVE: "repair_orders:approve",
  REPAIR_ORDERS_CLOSE: "repair_orders:close",

  // Labor
  LABOR_VIEW: "labor:view",
  LABOR_CREATE: "labor:create",
  LABOR_UPDATE: "labor:update",
  LABOR_DELETE: "labor:delete",

  // Parts
  PARTS_VIEW: "parts:view",
  PARTS_CREATE: "parts:create",
  PARTS_UPDATE: "parts:update",
  PARTS_DELETE: "parts:delete",
  PARTS_RECEIVE: "parts:receive",
  PARTS_RETURN: "parts:return",

  // Inventory
  INVENTORY_VIEW: "inventory:view",
  INVENTORY_CREATE: "inventory:create",
  INVENTORY_UPDATE: "inventory:update",
  INVENTORY_DELETE: "inventory:delete",
  INVENTORY_ADJUST: "inventory:adjust",
  INVENTORY_TRANSFER: "inventory:transfer",

  // Purchase Orders
  PURCHASE_ORDERS_VIEW: "purchase_orders:view",
  PURCHASE_ORDERS_CREATE: "purchase_orders:create",
  PURCHASE_ORDERS_UPDATE: "purchase_orders:update",
  PURCHASE_ORDERS_DELETE: "purchase_orders:delete",
  PURCHASE_ORDERS_APPROVE: "purchase_orders:approve",
  PURCHASE_ORDERS_RECEIVE: "purchase_orders:receive",

  // Scheduling
  SCHEDULING_VIEW: "scheduling:view",
  SCHEDULING_CREATE: "scheduling:create",
  SCHEDULING_UPDATE: "scheduling:update",
  SCHEDULING_DELETE: "scheduling:delete",

  // Documents
  DOCUMENTS_VIEW: "documents:view",
  DOCUMENTS_CREATE: "documents:create",
  DOCUMENTS_UPDATE: "documents:update",
  DOCUMENTS_DELETE: "documents:delete",

  // Reports
  REPORTS_VIEW: "reports:view",
  REPORTS_EXPORT: "reports:export",

  // Analytics
  ANALYTICS_VIEW: "analytics:view",

  // Billing
  BILLING_VIEW: "billing:view",
  BILLING_UPDATE: "billing:update",

  // Audit
  AUDIT_VIEW: "audit:view",

  // Administration
  SETTINGS_VIEW: "settings:view",
  SETTINGS_UPDATE: "settings:update",
} as const;

//************************************************************** */

export type Permission =
  (typeof Permissions)[keyof typeof Permissions];