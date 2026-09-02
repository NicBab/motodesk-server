export {
  default as employeeRouter,
} from "./employee.routes.js";

export {
  createEmployeeSchema,
  employeeIdSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from "./employee.schemas.js";

export type {
  CreateEmployeeInput,
  EmployeeIdInput,
  ListEmployeesQueryInput,
  UpdateEmployeeInput,
} from "./employee.schemas.js";

//************************************************************** */