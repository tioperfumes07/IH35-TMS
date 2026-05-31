import type { FastifyInstance } from "fastify";
import { registerCustomerDetailRoutes } from "./detail.routes.js";

export async function registerCustomerRoutes(app: FastifyInstance) {
  await registerCustomerDetailRoutes(app);
}
