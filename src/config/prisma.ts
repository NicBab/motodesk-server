// import { PrismaPg } from "@prisma/adapter-pg";

// import { PrismaClient } from "../generated/prisma/client.js";
// import { env } from "./env.js";

// const adapter = new PrismaPg({
//   connectionString: env.DATABASE_URL,
// });

// export const prisma = new PrismaClient({
//   adapter,
//   log:
//     env.NODE_ENV === "development"
//       ? ["query", "info", "warn", "error"]
//       : ["warn", "error"],
// });


import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "./env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

export const prisma = new PrismaClient({
  adapter,
  log:
    env.NODE_ENV === "development"
      ? ["warn", "error"]
      : ["error"],
});