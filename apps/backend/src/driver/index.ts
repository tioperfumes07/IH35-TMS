import type { FastifyInstance } from "fastify";
import { registerDriverSettlementDisputesP6Routes } from "./settlement-disputes-p6.routes.js";
import { registerDriverLoadsRoutes } from "./loads.routes.js";
import { registerDriverDvirRoutes } from "./dvir.routes.js";
import { registerDriverHosRoutes } from "./hos.routes.js";
import { registerDriverEarningsRoutes } from "./earnings.routes.js";
import { registerDriverPreferencesRoutes } from "./preferences.routes.js";

export async function registerDriverRoutes(app: FastifyInstance) {
  app.decorateRequest("driver", null);
  await registerDriverSettlementDisputesP6Routes(app);
  await registerDriverLoadsRoutes(app);
  await registerDriverDvirRoutes(app);
  await registerDriverHosRoutes(app);
  await registerDriverEarningsRoutes(app);
  await registerDriverPreferencesRoutes(app);
}
