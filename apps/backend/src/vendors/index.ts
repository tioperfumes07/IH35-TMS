import type { FastifyInstance } from "fastify";
import { registerVendorListRoutes } from "./list.routes.js";

export async function registerVendorRoutes(app: FastifyInstance) {
  await registerVendorListRoutes(app);
}
