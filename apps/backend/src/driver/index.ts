import type { FastifyInstance } from "fastify";
import { registerDriverLoadsRoutes } from "./loads.routes.js";
import { registerDriverDvirRoutes } from "./dvir.routes.js";
import { registerDriverHosRoutes } from "./hos.routes.js";
import { registerDriverEarningsRoutes } from "./earnings.routes.js";

export async function registerDriverRoutes(app: FastifyInstance) {
  app.decorateRequest("driver", null);
  await registerDriverLoadsRoutes(app);
  await registerDriverDvirRoutes(app);
  await registerDriverHosRoutes(app);
  await registerDriverEarningsRoutes(app);
}
