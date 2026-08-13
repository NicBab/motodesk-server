export {
  default as customerRouter,
} from "./customer.routes.js";

export {
  createCustomerSchema,
  customerIdSchema,
  updateCustomerSchema,
} from "./customer.schemas.js";

export type {
  CreateCustomerInput,
  CustomerIdInput,
  UpdateCustomerInput,
} from "./customer.schemas.js";