import type { FastifyInstance } from "fastify";
import { registerDriverAuthTokenRoutes } from "./auth-token.routes.js";
import { registerDriverSettlementDisputesP6Routes } from "./settlement-disputes-p6.routes.js";
import { registerDriverLoadsRoutes } from "./loads.routes.js";
import { registerDriverDvirRoutes } from "./dvir.routes.js";
import { registerDriverHosRoutes } from "./hos.routes.js";
import { registerDriverEarningsRoutes } from "./earnings.routes.js";
import { registerDriverPreferencesRoutes } from "./preferences.routes.js";
import { registerDriverPushSubscriptionRoutes } from "./push-subscriptions.routes.js";
import { registerDriverReportsRoutes } from "./reports.routes.js";
import { registerDriverArrivalPromptsRoutes } from "./arrival-prompts.routes.js";
import { registerDriverStatusSuggestionsRoutes } from "./status-suggestions.routes.js";

import { registerDriverFuelReceiptRoutes } from "./fuel-receipt.routes.js";

export async function registerDriverRoutes(app: FastifyInstance) {
  app.decorateRequest("driver", null);
  await registerDriverAuthTokenRoutes(app);
  await registerDriverSettlementDisputesP6Routes(app);
  await registerDriverLoadsRoutes(app);
  await registerDriverDvirRoutes(app);
  await registerDriverHosRoutes(app);
  await registerDriverEarningsRoutes(app);
  await registerDriverPreferencesRoutes(app);
  await registerDriverPushSubscriptionRoutes(app);
  await registerDriverArrivalPromptsRoutes(app);
  await registerDriverStatusSuggestionsRoutes(app);
  await registerDriverReportsRoutes(app);
  await registerDriverFuelReceiptRoutes(app);
}
