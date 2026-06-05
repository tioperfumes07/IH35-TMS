import type { FastifyInstance } from "fastify";
import { registerCustomerDetailRoutes } from "./detail.routes.js";
import { registerCustomerListRoutes } from "./list.routes.js";
import { registerVendorListRoutes } from "../vendors/list.routes.js";

export async function registerCustomerRoutes(app: FastifyInstance) {
  await registerCustomerListRoutes(app);
  await registerVendorListRoutes(app);
  await registerCustomerDetailRoutes(app);
}
