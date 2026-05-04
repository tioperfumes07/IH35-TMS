import type { FastifyInstance } from "fastify";
import { registerDriverRoutes } from "./drivers.routes.js";
import { registerUnitsRoutes } from "./units.routes.js";

export async function registerMdataRoutes(app: FastifyInstance) {
  await registerDriverRoutes(app);
  await registerUnitsRoutes(app);
}
